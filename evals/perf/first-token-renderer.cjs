// 渲染器首 token 探针（仅测量，不改产品代码）。
// 由 first-token.cjs 在主进程内调用：脚本化操作真实 renderer——
// 在启动页填入首句并点击「从零开始」（与用户点击同一路径），随后由产品自身的
// initialPrompt 自动发送流程发起流式请求；MutationObserver 记录
// 「首个非占位 assistant 正文文本」出现在 DOM 的时间。
//
// 这是脚本化驱动，不是人类研究；结果只描述「点击发送 → 渲染器文本可见」的固定链路。
// 返回 { firstTextMs, firstAnyTextMs, doneTextMs, error }

async function measureRendererFirstText(wc) {
  return wc.executeJavaScript(
    `(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const bridge = window.neonforge;
      if (!bridge || !bridge.gateway) return { error: 'window.neonforge.gateway missing' };
      const deadline = performance.now() + 20000;
      while (!document.querySelector('.nf-start') && performance.now() < deadline) await sleep(20);
      if (!document.querySelector('.nf-start')) return { error: 'start screen not ready' };

      const input = document.querySelector('.nf-start__input');
      if (!input) return { error: 'start input missing' };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(input, '性能探针：请回复一句很短的话。');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      // React 受控输入：等一次渲染，让 StartPage 的 value state 跟上后再点 CTA。
      await sleep(100);
      const cta = [...document.querySelectorAll('.nf-start__cta')].find((el) =>
        el.textContent.includes('从零开始'),
      );
      if (!cta) return { error: 'start cta missing' };

      const root = document.body;
      let firstTextAt = null;
      let startedAt = null;
      let firstChunkAt = null;
      let firstContentChunkAt = null;
      let firstReasoningChunkAt = null;
      let firstToolCallChunkAt = null;
      let doneChunkAt = null;

      const offChunks = bridge.gateway.onStreamChunk((chunk) => {
        if (startedAt === null) return;
        const at = performance.now() - startedAt;
        if (firstChunkAt === null) firstChunkAt = at;
        if (chunk.type === 'reasoning' && firstReasoningChunkAt === null) firstReasoningChunkAt = at;
        if (chunk.type === 'content' && firstContentChunkAt === null) firstContentChunkAt = at;
        if (chunk.type === 'tool-call' && firstToolCallChunkAt === null) firstToolCallChunkAt = at;
        if (chunk.type === 'done') {
          doneChunkAt = at;
          offChunks();
        }
      });

      // 首个非占位正文：Assistant body 去掉 --thinking 且内容不是占位文案。
      const bodyReady = () => {
        const bodies = document.querySelectorAll('.nf-msg--assistant .nf-msg__body');
        for (const body of bodies) {
          if (body.classList.contains('nf-msg__body--thinking')) continue;
          const text = (body.textContent || '').trim();
          if (!text || text === '搭档处理中…') continue;
          return true;
        }
        return false;
      };
      const observer = new MutationObserver(() => {
        if (firstTextAt === null && bodyReady()) firstTextAt = performance.now() - startedAt;
      });

      startedAt = performance.now();
      observer.observe(root, { childList: true, subtree: true, characterData: true });
      cta.click();

      // 最长 120s；真实上游思考慢时由 runner 的 total timeout 兜底。
      const waitDeadline = performance.now() + 120000;
      while (firstTextAt === null && performance.now() < waitDeadline) await sleep(5);
      const diag = {
        screen: document.querySelector('.nf-app') ? document.querySelector('.nf-app').className : null,
        userMsgs: document.querySelectorAll('.nf-msg--user').length,
        assistantMsgs: document.querySelectorAll('.nf-msg--assistant').length,
        bodies: [...document.querySelectorAll('.nf-msg--assistant .nf-msg__body')]
          .map((b) => ({ thinking: b.classList.contains('nf-msg__body--thinking'), text: (b.textContent || '').slice(0, 80) })),
        inputValue: input.value,
      };
      // 等 done chunk（最多 30s）后断开观察，保证跨多个独立回合的统计稳定。
      const doneDeadline = performance.now() + 30000;
      while (doneChunkAt === null && performance.now() < doneDeadline) await sleep(10);
      await sleep(200);
      observer.disconnect();
      return {
        firstTextMs: firstTextAt,
        firstChunkMs: firstChunkAt,
        firstReasoningChunkMs: firstReasoningChunkAt,
        firstContentChunkMs: firstContentChunkAt,
        firstToolCallChunkMs: firstToolCallChunkAt,
        doneChunkMs: doneChunkAt,
        diag,
      };
    })()`,
    true,
  )
}

module.exports = { measureRendererFirstText }
