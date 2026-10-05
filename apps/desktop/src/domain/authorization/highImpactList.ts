// 高影响操作清单（段2 §4 语言表行＋附录 A 初版枚举／段3 §2「只读参考数据」不建聚合）。
// 唯一源＝段2 §4；本表为运行期形状（域内只读常量）。S-3 的 CI diff 比对属 S2（D4 本阶段不立）。
// 扩展必经用户裁定（段2 §4）；条目文案与段2 逐字，勿在此就地改写语义。
export type HighImpactOperation =
  | '删除文件'
  | '改写 git 历史（force push/reset --hard 类）'
  | '安装/卸载依赖'
  | '修改凭据配置'
  | '外发仓库内容出本机'

export const HIGH_IMPACT_LIST: readonly HighImpactOperation[] = [
  '删除文件',
  '改写 git 历史（force push/reset --hard 类）',
  '安装/卸载依赖',
  '修改凭据配置',
  '外发仓库内容出本机',
] as const
