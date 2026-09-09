import { CheckCircle2, LoaderCircle, Plus, Save, Trash2, TriangleAlert, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { api } from './api'
import { cleanJobProfile, validateJobProfile, weightPercent } from './jobProfileEditorUtils'
import type { Job, JobDimension, JobProfile, JobProfileUpdateResult, ReevaluateStrategy } from './types'

interface Props {
  job: Job
  profile: JobProfile
  onCancel: () => void
  onSaved: (result: JobProfileUpdateResult) => void
}

const strategyOptions: Array<{ value: ReevaluateStrategy; title: string; detail: string }> = [
  { value: 'pending', title: '重评未完成人工决策的候选人（推荐）', detail: '待评估、评估中、已评估和失败记录进入新一轮评估。' },
  { value: 'none', title: '仅用于后续候选人', detail: '现有候选人和报告保持不变。' },
  { value: 'all', title: '重评全部候选人', detail: '全部重新生成 AI 报告，但通过、待定、淘汰等人工状态不会改变。' },
]

export function JobProfileEditor({ job, profile, onCancel, onSaved }: Props) {
  const [draft, setDraft] = useState<JobProfile>(() => structuredClone(profile))
  const [strategy, setStrategy] = useState<ReevaluateStrategy>('pending')
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState('')
  const errors = useMemo(() => validateJobProfile(draft), [draft])
  const total = weightPercent(draft)

  const updateDimension = (index: number, patch: Partial<JobDimension>) => {
    setDraft((current) => ({ ...current, dimensions: current.dimensions.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }))
  }
  const updateRequirement = (dimensionIndex: number, requirementIndex: number, value: string) => {
    const dimension = draft.dimensions[dimensionIndex]
    updateDimension(dimensionIndex, { requirements: dimension.requirements.map((item, index) => index === requirementIndex ? value : item) })
  }
  const removeRequirement = (dimensionIndex: number, requirementIndex: number) => {
    const dimension = draft.dimensions[dimensionIndex]
    updateDimension(dimensionIndex, { requirements: dimension.requirements.filter((_, index) => index !== requirementIndex) })
  }
  const save = async () => {
    if (errors.length) return
    setSaving(true); setServerError('')
    try { onSaved(await api.updateJobProfile(job.id, cleanJobProfile(draft), strategy)) }
    catch (cause) { setServerError(cause instanceof Error ? cause.message : '岗位画像保存失败') }
    finally { setSaving(false) }
  }

  return <section className="profile-editor" aria-label="人工编辑岗位画像">
    <header className="profile-editor-head"><div><span>人工校准</span><h2>编辑五维岗位画像</h2><p>Agent 画像已经生效；保存修改后会生成新的评估依据。</p></div><button className="icon-button" title="取消编辑" onClick={onCancel}><X size={18} /></button></header>
    <div className="profile-editor-notice"><CheckCircle2 size={16} /><p><strong>人工决策不会被覆盖</strong>无论选择哪种重评方式，候选人的通过、待定、淘汰状态都保持不变。</p></div>
    <div className="profile-editor-dimensions">{draft.dimensions.map((dimension, dimensionIndex) => <article className="dimension-editor" key={dimension.id}>
      <div className="dimension-editor-title"><b>{dimensionIndex + 1}</b><label>维度名称<input value={dimension.name} onChange={(event) => updateDimension(dimensionIndex, { name: event.target.value })} /></label><label className="weight-field">权重（%）<input type="number" min="10" max="35" step="1" value={Math.round(dimension.weight * 10000) / 100} onChange={(event) => updateDimension(dimensionIndex, { weight: Number(event.target.value) / 100 })} /></label><label className="must-field"><input type="checkbox" checked={dimension.mustHave} onChange={(event) => updateDimension(dimensionIndex, { mustHave: event.target.checked })} />关键项</label></div>
      <label>维度描述<textarea rows={2} value={dimension.description} onChange={(event) => updateDimension(dimensionIndex, { description: event.target.value })} /></label>
      <div className="editor-list-head"><strong>评估要求</strong><button type="button" onClick={() => updateDimension(dimensionIndex, { requirements: [...dimension.requirements, ''] })}><Plus size={13} />添加要求</button></div>
      <div className="editor-input-list">{dimension.requirements.map((requirement, requirementIndex) => <div key={requirementIndex}><input aria-label={`${dimension.name}要求 ${requirementIndex + 1}`} value={requirement} onChange={(event) => updateRequirement(dimensionIndex, requirementIndex, event.target.value)} /><button type="button" title="删除要求" onClick={() => removeRequirement(dimensionIndex, requirementIndex)}><Trash2 size={14} /></button></div>)}</div>
    </article>)}</div>
    <section className="reevaluate-options"><h3>保存后如何处理已有候选人？</h3>{strategyOptions.map((option) => <label className={strategy === option.value ? 'selected' : ''} key={option.value}><input type="radio" name="reevaluate" value={option.value} checked={strategy === option.value} onChange={() => setStrategy(option.value)} /><span><strong>{option.title}</strong><small>{option.detail}</small></span></label>)}</section>
    <footer className="profile-editor-footer"><div className={errors.length ? 'invalid' : 'valid'}><strong>当前权重 {total}%</strong><span>{errors[0] || '校验通过，可以保存'}</span></div>{serverError && <p className="form-error"><TriangleAlert size={15} />{serverError}</p>}<button className="secondary-button" onClick={onCancel}>取消</button><button className="primary-button" disabled={saving || errors.length > 0} onClick={() => void save()}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{saving ? '保存中' : '保存新画像'}</button></footer>
  </section>
}
