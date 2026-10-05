// 类型化领域错误（详设 §2：违反不变量以类型化 DomainError 抛出；拒绝理由入命令回执，不进 timeline）。
// code＝违例的不变量/DoD 号，供呈现侧定位；跨聚合共享（Delegation/Turn/…）。
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'DomainError'
  }
}
