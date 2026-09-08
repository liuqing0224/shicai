import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronRight,
  CirclePause,
  ClipboardList,
  FileSearch,
  Filter,
  LoaderCircle,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  TriangleAlert,
  UserRound,
  UsersRound,
  X,
  XCircle,
} from 'lucide-react'
import { api } from './api'
import { CandidateDrawer } from './CandidateDrawer'
import { JobProfileDetails } from './JobProfileDetails'
import { candidatesForJob } from './workflow'
import type { Candidate, CandidateStatus, CollectResult, Job } from './types'

type View = 'overview' | 'jobs' | 'job-candidates'
type Toast = { kind: 'success' | 'error'; text: string }

const statusMeta: Record<CandidateStatus, { label: string; className: string }> = {
  pending: { label: '待评估', className: 'status-neutral' },
  processing: { label: '评估中', className: 'status-processing' },
  reviewed: { label: '已评估', className: 'status-reviewed' },
  passed: { label: '通过', className: 'status-passed' },
  hold: { label: '待定', className: 'status-hold' },
  rejected: { label: '淘汰', className: 'status-rejected' },
  failed: { label: '评估失败', className: 'status-rejected' },
}

const normalizeCandidate = (candidate: Candidate): Candidate => ({
  ...candidate,
  id: String(candidate.id),
  jobId: String(candidate.jobId ?? ''),
  status: statusMeta[candidate.status] ? candidate.status : 'pending',
})

function App() {
  const [view, setView] = useState<View>('overview')
  const [jobs, setJobs] = useState<Job[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<Toast | null>(null)
  const [mobileNav, setMobileNav] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedJobId, setSelectedJobId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    else setRefreshing(true)
    try {
      const [nextJobs, nextCandidates] = await Promise.all([api.jobs(), api.candidates()])
      setJobs(nextJobs.map((job) => ({ ...job, id: String(job.id) })))
      setCandidates(nextCandidates.map(normalizeCandidate))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法连接服务')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { void loadData() }, [loadData])
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(id)
  }, [toast])

  const filteredCandidates = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return candidatesForJob(candidates, selectedJobId).filter((candidate) => {
      if (statusFilter && candidate.status !== statusFilter) return false
      if (!needle) return true
      return [candidate.name, candidate.currentCompany, candidate.currentTitle, candidate.jobName]
        .some((value) => value?.toLowerCase().includes(needle))
    })
  }, [candidates, selectedJobId, statusFilter, search])

  const openCandidate = async (candidate: Candidate) => {
    setSelectedCandidate(candidate)
    try {
      setSelectedCandidate(normalizeCandidate(await api.candidate(candidate.id)))
    } catch {
      // The list payload still provides a useful fallback when detail fetch is unavailable.
    }
  }

  const changeStatus = async (candidate: Candidate, status: CandidateStatus) => {
    const previous = candidate.status
    const update = (value: CandidateStatus) => {
      setCandidates((items) => items.map((item) => item.id === candidate.id ? { ...item, status: value } : item))
      setSelectedCandidate((item) => item?.id === candidate.id ? { ...item, status: value } : item)
    }
    update(status)
    try {
      await api.setCandidateStatus(candidate.id, status)
      setToast({ kind: 'success', text: `${candidate.name} 已标记为${statusMeta[status].label}` })
    } catch (cause) {
      update(previous)
      setToast({ kind: 'error', text: cause instanceof Error ? cause.message : '更新失败' })
    }
  }

  const go = (next: View) => {
    setView(next)
    if (next !== 'job-candidates') setSelectedJobId('')
    setMobileNav(false)
  }

  const openJobCandidates = (jobId: string) => {
    setSelectedJobId(jobId)
    setStatusFilter('')
    setSearch('')
    setView('job-candidates')
  }

  const selectedJob = jobs.find((job) => job.id === selectedJobId)

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><FileSearch size={20} /></div>
          <div><strong>简历评估</strong><span>招聘工作台</span></div>
        </div>
        <nav className="nav-list" aria-label="主导航">
          <NavButton active={view === 'overview'} icon={<ClipboardList />} label="总览" onClick={() => go('overview')} />
          <NavButton active={view === 'jobs' || view === 'job-candidates'} icon={<BriefcaseBusiness />} label="职位与 JD" onClick={() => go('jobs')} />
        </nav>
        <div className="sidebar-foot"><span className={`health-dot ${error ? 'offline' : ''}`} />{error ? '服务未连接' : '服务运行中'}</div>
      </aside>
      {mobileNav && <button className="nav-scrim" aria-label="关闭导航" onClick={() => setMobileNav(false)} />}

      <main className="main">
        <header className="topbar">
          <button className="icon-button mobile-menu" title="菜单" onClick={() => setMobileNav(true)}><Menu size={20} /></button>
          {view === 'job-candidates' ? <div className="context-title"><button className="context-back" title="返回职位列表" onClick={() => go('jobs')}><ArrowLeft size={18} /></button><div><p className="eyebrow">职位候选人</p><h1>{selectedJob?.name || '职位候选人'}</h1></div></div> : <div><p className="eyebrow">{view === 'overview' ? '工作台' : '人才需求'}</p><h1>{view === 'overview' ? '招聘总览' : '职位与 JD'}</h1></div>}
          <div className="top-actions">
            <button className="icon-button" title="刷新数据" disabled={refreshing} onClick={() => void loadData(true)}><RefreshCw className={refreshing ? 'spin' : ''} size={18} /></button>
            {view === 'jobs' && <button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={17} />新建职位</button>}
          </div>
        </header>

        {loading ? <PageLoading /> : error && !jobs.length && !candidates.length ? <ErrorState message={error} retry={() => void loadData()} /> : (
          <>
            {error && <div className="inline-warning"><TriangleAlert size={17} />数据刷新失败，当前显示上次结果：{error}</div>}
            {view === 'overview' && <Overview jobs={jobs} candidates={candidates} onViewJobs={() => go('jobs')} />}
            {view === 'jobs' && <JobsView jobs={jobs} candidates={candidates} onCreate={() => setCreateOpen(true)} onOpenCandidates={openJobCandidates} onCollectSuccess={(result) => { setToast({ kind: 'success', text: collectMessage(result) }); void loadData(true) }} />}
            {view === 'job-candidates' && selectedJob && <CandidatesView candidates={filteredCandidates} job={selectedJob} statusFilter={statusFilter} search={search} onBack={() => go('jobs')} onStatusFilter={setStatusFilter} onSearch={setSearch} onOpen={(candidate) => void openCandidate(candidate)} onStatus={changeStatus} />}
            {view === 'job-candidates' && !selectedJob && <EmptyPage icon={<BriefcaseBusiness />} title="职位不存在" text="该职位可能已被删除，请返回职位列表重新选择。" action="返回职位列表" onAction={() => go('jobs')} />}
          </>
        )}
      </main>

      {createOpen && <CreateJobModal onClose={() => setCreateOpen(false)} onCreated={(job) => { setJobs((items) => [job, ...items]); setCreateOpen(false); setToast({ kind: 'success', text: `职位“${job.name}”已创建` }) }} />}
      {selectedCandidate && <CandidateDrawer candidate={selectedCandidate} job={jobs.find((job) => job.id === selectedCandidate.jobId)} onClose={() => setSelectedCandidate(null)} onStatus={changeStatus} />}
      {toast && <div className={`toast toast-${toast.kind}`}>{toast.kind === 'success' ? <CheckCircle2 size={18} /> : <TriangleAlert size={18} />}{toast.text}</div>}
    </div>
  )
}

function NavButton({ active, icon, label, count, onClick }: { active: boolean; icon: React.ReactNode; label: string; count?: number; onClick: () => void }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span>{count !== undefined && <b>{count}</b>}</button>
}

function Overview({ jobs, candidates, onViewJobs }: { jobs: Job[]; candidates: Candidate[]; onViewJobs: () => void }) {
  const reviewed = candidates.filter((item) => ['reviewed', 'passed', 'hold', 'rejected'].includes(item.status)).length
  const pending = candidates.filter((item) => ['pending', 'processing'].includes(item.status)).length
  const passed = candidates.filter((item) => item.status === 'passed').length
  const scoreCandidates = candidates.filter((item) => typeof item.score === 'number')
  const average = scoreCandidates.length ? Math.round(scoreCandidates.reduce((sum, item) => sum + Number(item.score), 0) / scoreCandidates.length) : 0
  const recent = [...candidates].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 6)
  return <div className="page-content">
    <section className="metric-grid">
      <Metric label="开放职位" value={jobs.length} hint="正在招聘" icon={<BriefcaseBusiness />} tone="ink" />
      <Metric label="候选人" value={candidates.length} hint={`${pending} 人待处理`} icon={<UsersRound />} tone="blue" />
      <Metric label="已完成评估" value={reviewed} hint={candidates.length ? `${Math.round(reviewed / candidates.length * 100)}% 完成率` : '暂无评估'} icon={<CheckCircle2 />} tone="green" />
      <Metric label="平均匹配分" value={average || '—'} hint={`${passed} 人已通过`} icon={<Sparkles />} tone="amber" />
    </section>
    <section className="overview-grid">
      <div className="panel wide-panel">
        <div className="panel-head"><div><h2>最近候选人</h2><p>候选人按所属职位统一管理</p></div><button className="text-button" onClick={onViewJobs}>前往职位<ChevronRight size={16} /></button></div>
        {recent.length ? <div className="compact-list">{recent.map((candidate) => <div className="compact-row" key={candidate.id}><Avatar name={candidate.name} /><div className="grow"><strong>{candidate.name}</strong><span>{candidate.currentTitle || candidate.jobName || '职位信息待补充'}</span></div><Score score={candidate.score} /><Status status={candidate.status} /></div>)}</div> : <EmptyMini text="采集后，候选人会出现在这里" />}
      </div>
      <div className="panel">
        <div className="panel-head"><div><h2>职位进展</h2><p>各职位候选人数量</p></div><button className="text-button" onClick={onViewJobs}>管理<ChevronRight size={16} /></button></div>
        {jobs.length ? <div className="job-progress">{jobs.slice(0, 6).map((job) => { const count = candidates.filter((item) => item.jobId === job.id).length; const width = candidates.length ? Math.max(5, count / candidates.length * 100) : 5; return <div key={job.id}><div className="progress-label"><span>{job.name}</span><b>{count}</b></div><div className="progress-track"><i style={{ width: `${width}%` }} /></div></div> })}</div> : <EmptyMini text="先创建一个招聘职位" />}
      </div>
    </section>
  </div>
}

function Metric({ label, value, hint, icon, tone }: { label: string; value: number | string; hint: string; icon: React.ReactNode; tone: string }) {
  return <div className="metric"><div className={`metric-icon tone-${tone}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></div>
}

function JobsView({ jobs, candidates, onCreate, onOpenCandidates, onCollectSuccess }: { jobs: Job[]; candidates: Candidate[]; onCreate: () => void; onOpenCandidates: (jobId: string) => void; onCollectSuccess: (result: CollectResult) => void }) {
  const [collecting, setCollecting] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const collect = async (job: Job) => {
    setCollecting(job.id)
    try { onCollectSuccess(await api.collect(job.id)) }
    catch (cause) { onCollectSuccess({ message: cause instanceof Error ? `采集失败：${cause.message}` : '采集失败' }) }
    finally { setCollecting(null) }
  }
  if (!jobs.length) return <EmptyPage icon={<BriefcaseBusiness />} title="还没有招聘职位" text="创建职位并录入 JD，系统才能按要求评估简历。" action="新建职位" onAction={onCreate} />
  return <div className="page-content"><div className="job-grid">{jobs.map((job) => {
    const related = candidates.filter((item) => item.jobId === job.id)
    const done = related.filter((item) => !['pending', 'processing'].includes(item.status)).length
    return <article className="job-card" key={job.id}>
      <div className="job-card-head"><div className="job-icon"><BriefcaseBusiness size={20} /></div><span className={`job-state ${job.status === 'paused' ? 'paused' : ''}`}>{job.status === 'paused' ? '已暂停' : '招聘中'}</span></div>
      <h3>{job.name}</h3><p className="department">{job.department || '未设置部门'}</p>
      <div className="job-stats"><div><strong>{related.length}</strong><span>候选人</span></div><div><strong>{done}</strong><span>已评估</span></div><div><strong>{related.filter((item) => item.status === 'passed').length}</strong><span>已通过</span></div></div>
      <button className="jd-toggle" onClick={() => setExpanded(expanded === job.id ? null : job.id)}>岗位画像 <ChevronRight className={expanded === job.id ? 'rotate' : ''} size={16} /></button>
      {expanded === job.id && <JobProfileDetails job={job} />}
      <div className="job-actions"><button className="candidate-button" onClick={() => onOpenCandidates(job.id)}><UsersRound size={17} />查看候选人<ChevronRight size={16} /></button><button className="collect-button" disabled={collecting === job.id || job.status === 'paused'} onClick={() => void collect(job)}>{collecting === job.id ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}{collecting === job.id ? '正在采集…' : '启动飞书采集'}</button></div>
    </article>
  })}</div></div>
}

function CandidatesView(props: { candidates: Candidate[]; job: Job; statusFilter: string; search: string; onBack: () => void; onStatusFilter: (value: string) => void; onSearch: (value: string) => void; onOpen: (candidate: Candidate) => void; onStatus: (candidate: Candidate, status: CandidateStatus) => void }) {
  return <div className="page-content">
    <div className="candidate-context"><button className="text-button" onClick={props.onBack}><ArrowLeft size={16} />返回职位列表</button><span>{props.job.department || '未设置部门'} · {props.candidates.length} 位候选人</span></div>
    <div className="filters"><div className="search-field"><Search size={17} /><input value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="搜索姓名、公司或当前职位" /></div><div className="select-wrap"><Filter size={16} /><select value={props.statusFilter} onChange={(event) => props.onStatusFilter(event.target.value)}><option value="">全部状态</option>{Object.entries(statusMeta).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></div></div>
    <div className="table-panel"><div className="table-meta"><span>{props.job.name} · 共 {props.candidates.length} 位候选人</span></div>{props.candidates.length ? <div className="table-scroll"><table><thead><tr><th>候选人</th><th>应聘职位</th><th>匹配度</th><th>AI 建议</th><th>人工状态</th><th>最近更新</th><th className="actions-head">操作</th></tr></thead><tbody>{props.candidates.map((candidate) => <CandidateRow key={candidate.id} candidate={candidate} job={props.job} onOpen={props.onOpen} onStatus={props.onStatus} />)}</tbody></table></div> : <EmptyMini text="该职位下没有符合当前筛选条件的候选人" />}</div>
  </div>
}

function CandidateRow({ candidate, job, onOpen, onStatus }: { candidate: Candidate; job?: Job; onOpen: (candidate: Candidate) => void; onStatus: (candidate: Candidate, status: CandidateStatus) => void }) {
  return <tr><td><button className="candidate-cell" onClick={() => onOpen(candidate)}><Avatar name={candidate.name} /><span><strong>{candidate.name}</strong><small>{candidate.currentCompany || candidate.currentTitle || candidate.source || '飞书招聘'}</small></span></button></td><td>{candidate.jobName || job?.name || '—'}</td><td><Score score={candidate.score} level={candidate.level} /></td><td><Recommendation value={candidate.recommendation} /></td><td><Status status={candidate.status} /></td><td className="muted">{formatDate(candidate.updatedAt)}</td><td><div className="row-actions"><button title="通过" className={candidate.status === 'passed' ? 'chosen pass' : ''} onClick={() => onStatus(candidate, 'passed')}><Check size={16} /></button><button title="待定" className={candidate.status === 'hold' ? 'chosen hold' : ''} onClick={() => onStatus(candidate, 'hold')}><CirclePause size={16} /></button><button title="淘汰" className={candidate.status === 'rejected' ? 'chosen reject' : ''} onClick={() => onStatus(candidate, 'rejected')}><X size={16} /></button><button title="查看详情" onClick={() => onOpen(candidate)}><ChevronRight size={17} /></button></div></td></tr>
}

function CreateJobModal({ onClose, onCreated }: { onClose: () => void; onCreated: (job: Job) => void }) {
  const [name, setName] = useState('')
  const [department, setDepartment] = useState('')
  const [jd, setJd] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !jd.trim()) { setError('请填写职位名称和职位描述'); return }
    setSaving(true); setError('')
    try { onCreated(await api.createJob({ name: name.trim(), department: department.trim(), jd: jd.trim() })) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '创建失败') }
    finally { setSaving(false) }
  }
  return <div className="modal-layer" role="dialog" aria-modal="true"><button className="modal-backdrop" aria-label="关闭" onClick={onClose} /><form className="modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">人才需求</p><h2>新建职位</h2></div><button type="button" className="icon-button" title="关闭" onClick={onClose}><X size={19} /></button></div><label>职位名称<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="须与飞书招聘中的职位名称一致" /></label><label>所属部门（选填）<input value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="例如：产品研发部" /></label><label>职位描述（JD）<textarea rows={11} value={jd} onChange={(event) => setJd(event.target.value)} placeholder="粘贴完整 JD，包括职责、必备条件和加分项…" /></label>{error && <p className="form-error"><TriangleAlert size={15} />{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button type="submit" className="primary-button" disabled={saving}>{saving && <LoaderCircle className="spin" size={17} />}{saving ? '创建中…' : '创建职位'}</button></div></form></div>
}

function Avatar({ name, large = false }: { name: string; large?: boolean }) { return <span className={`avatar ${large ? 'large' : ''}`}>{name?.trim().slice(0, 1) || <UserRound size={16} />}</span> }
function Status({ status }: { status: CandidateStatus }) { const meta = statusMeta[status] || statusMeta.pending; return <span className={`status ${meta.className}`}>{status === 'processing' && <i />}{meta.label}</span> }
function Recommendation({ value }: { value?: Candidate['recommendation'] }) {
  if (!value) return null
  const labels = { strong_yes: '建议通过', yes: '建议通过', hold: '建议待定', no: '建议淘汰' }
  return <span className={`recommendation recommendation-${value}`}><Sparkles size={11} />{labels[value]}</span>
}
function Score({ score, level }: { score?: number | null; level?: string | null }) { if (typeof score !== 'number') return <span className="score-empty">—</span>; return <span className={`score ${score >= 80 ? 'score-high' : score >= 60 ? 'score-mid' : 'score-low'}`}><b>{score}</b>{level && <small>{level}</small>}</span> }
function PageLoading() { return <div className="state-page"><LoaderCircle className="spin" size={28} /><p>正在载入工作台…</p></div> }
function ErrorState({ message, retry }: { message: string; retry: () => void }) { return <div className="state-page"><div className="state-icon error"><XCircle size={28} /></div><h2>暂时无法读取数据</h2><p>{message}</p><button className="primary-button" onClick={retry}><RefreshCw size={17} />重新连接</button></div> }
function EmptyPage({ icon, title, text, action, onAction }: { icon: React.ReactNode; title: string; text: string; action: string; onAction: () => void }) { return <div className="state-page"><div className="state-icon">{icon}</div><h2>{title}</h2><p>{text}</p><button className="primary-button" onClick={onAction}><Plus size={17} />{action}</button></div> }
function EmptyMini({ text }: { text: string }) { return <div className="empty-mini"><FileSearch size={22} /><span>{text}</span></div> }
function formatDate(value?: string) { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date) }
function collectMessage(result: CollectResult) { if (result.message) return result.message; return `采集完成：导入 ${result.imported ?? 0} 人，进入评估 ${result.queued ?? result.imported ?? 0} 人${result.skipped ? `，跳过 ${result.skipped} 人` : ''}` }

export default App
