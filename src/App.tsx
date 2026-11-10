import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import './App.css'

type Task = {
  id: number
  cloudId?: string
  title: string
  project: string
  date: string
  completed: boolean
  priority: 'Low' | 'Medium' | 'High'
  assignee?: string
}

type Workspace = {
  id: number
  cloudId?: string
  name: string
  category: string
  members: number
  color: 'purple' | 'blue' | 'orange'
}

type Activity = {
  id: number
  title: string
  detail: string
  time: string
}

type TeamMember = {
  id: number
  name: string
  email: string
  role: 'Admin' | 'Member'
  workspaceId: number
}

const starterTasks: Task[] = [
  { id: 1, title: 'Finalize homepage design', project: 'Website Redesign', date: '2026-11-10', completed: false, priority: 'High' },
  { id: 2, title: 'Review project requirements', project: 'College Project', date: '2026-11-10', completed: false, priority: 'Medium' },
  { id: 3, title: 'Prepare team presentation', project: 'Marketing Team', date: '2026-11-11', completed: true, priority: 'High' },
  { id: 4, title: 'Update workspace documentation', project: 'Website Redesign', date: '2026-11-12', completed: false, priority: 'Low' },
]

const starterWorkspaces: Workspace[] = [
  { id: 1, name: 'Website Redesign', category: 'Design & Development', members: 4, color: 'purple' },
  { id: 2, name: 'College Project', category: 'Academic Team', members: 6, color: 'blue' },
  { id: 3, name: 'Marketing Team', category: 'Creative & Strategy', members: 3, color: 'orange' },
]

function getDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function readSaved<T,>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key)
    return saved ? JSON.parse(saved) as T : fallback
  } catch {
    return fallback
  }
}

function writeSaved(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    console.warn(`TogetherOS could not save "${key}" in browser storage.`)
  }
}


type TogetherOSBackup = {
  app: 'TogetherOS'
  version: 1
  createdAt: string
  data: {
    tasks: Task[]
    workspaces: Workspace[]
    activities: Activity[]
    teamMembers: TeamMember[]
    profileName: string
    profileEmail: string
    darkMode: boolean
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTask(value: unknown): value is Task {
  if (!isRecord(value)) return false
  return Number.isFinite(value.id) &&
    typeof value.title === 'string' &&
    typeof value.project === 'string' &&
    typeof value.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.date) &&
    typeof value.completed === 'boolean' &&
    ['Low', 'Medium', 'High'].includes(String(value.priority)) &&
    (value.assignee === undefined || typeof value.assignee === 'string')
}

function isWorkspace(value: unknown): value is Workspace {
  if (!isRecord(value)) return false
  return Number.isFinite(value.id) &&
    typeof value.name === 'string' &&
    typeof value.category === 'string' &&
    typeof value.members === 'number' &&
    Number.isFinite(value.members) &&
    ['purple', 'blue', 'orange'].includes(String(value.color))
}

function isActivity(value: unknown): value is Activity {
  if (!isRecord(value)) return false
  return Number.isFinite(value.id) &&
    typeof value.title === 'string' &&
    typeof value.detail === 'string' &&
    typeof value.time === 'string'
}

function isTeamMember(value: unknown): value is TeamMember {
  if (!isRecord(value)) return false
  return Number.isFinite(value.id) &&
    typeof value.name === 'string' &&
    typeof value.email === 'string' &&
    ['Admin', 'Member'].includes(String(value.role)) &&
    Number.isFinite(value.workspaceId)
}

function isTogetherOSBackup(value: unknown): value is TogetherOSBackup {
  if (!isRecord(value) || value.app !== 'TogetherOS' || value.version !== 1) return false
  if (!isRecord(value.data)) return false

  const data = value.data
  return Array.isArray(data.tasks) && data.tasks.every(isTask) &&
    Array.isArray(data.workspaces) && data.workspaces.every(isWorkspace) &&
    Array.isArray(data.activities) && data.activities.every(isActivity) &&
    Array.isArray(data.teamMembers) && data.teamMembers.every(isTeamMember) &&
    typeof data.profileName === 'string' &&
    typeof data.profileEmail === 'string' &&
    typeof data.darkMode === 'boolean'
}

type WorkspaceAppProps = {
  userId: string
  userEmail: string
  userName: string
  onSignOut: () => Promise<void>
}

function WorkspaceApp({ userId, userEmail, userName, onSignOut }: WorkspaceAppProps) {
  const storageKey = useMemo(() => (key: string) => `togetheros:${userId}:${key}`, [userId])
  const [activePage, setActivePage] = useState('Overview')
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false)
  const [darkMode, setDarkMode] = useState(() => readSaved(storageKey('togetheros-theme'), false))
  const [tasks, setTasks] = useState<Task[]>(() => readSaved(storageKey('togetheros-tasks'), starterTasks))
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => readSaved(storageKey('togetheros-workspaces'), starterWorkspaces))
  const [activities, setActivities] = useState<Activity[]>(() => readSaved(storageKey('togetheros-activity'), [
    { id: 1, title: 'Workspace created', detail: 'Website Redesign was added', time: 'Getting started' },
    { id: 2, title: 'Task completed', detail: 'Prepare team presentation', time: 'Sample activity' },
  ]))
  const [search, setSearch] = useState('')
  const [taskFilter, setTaskFilter] = useState<'All' | 'Pending' | 'Completed' | 'Overdue'>('All')
  const [showNotifications, setShowNotifications] = useState(false)
  const [formFeedback, setFormFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // TOGETHEROS SMART DROPDOWNS V1
  // Close menus on outside click or Escape.
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      const clickedInsideMenu =
        target instanceof Element &&
        target.closest('.workspace-switcher-wrap, .notification-wrap, .profile-menu-wrap')

      if (!clickedInsideMenu) {
        setShowWorkspaceMenu(false)
        setShowNotifications(false)
        setShowProfileMenu(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowWorkspaceMenu(false)
        setShowNotifications(false)
        setShowProfileMenu(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<number | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() => readSaved(storageKey('togetheros-members'), []))
  const [showMemberForm, setShowMemberForm] = useState(false)
  const [memberName, setMemberName] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [memberRole, setMemberRole] = useState<TeamMember['role']>('Member')
  const [taskAssignee, setTaskAssignee] = useState('')
  const [profileName, setProfileName] = useState(() => readSaved(storageKey('togetheros-profile-name'), userName || 'Your profile'))
  const [profileEmail, setProfileEmail] = useState(() => readSaved(storageKey('togetheros-profile-email'), userEmail))
  const [backupMessage, setBackupMessage] = useState('')
  const [currentDateKey] = useState(() => getDateKey(new Date()))
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })

  const [showTaskForm, setShowTaskForm] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [showWorkspaceForm, setShowWorkspaceForm] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskProject, setTaskProject] = useState('')
  const [taskDate, setTaskDate] = useState(currentDateKey)
  const [taskPriority, setTaskPriority] = useState<Task['priority']>('Medium')
  const [workspaceName, setWorkspaceName] = useState('')
  const [workspaceCategory, setWorkspaceCategory] = useState('General')


  useEffect(() => writeSaved(storageKey('togetheros-tasks'), tasks), [tasks, storageKey])
  useEffect(() => writeSaved(storageKey('togetheros-workspaces'), workspaces), [workspaces, storageKey])
  useEffect(() => writeSaved(storageKey('togetheros-activity'), activities), [activities, storageKey])
  useEffect(() => writeSaved(storageKey('togetheros-theme'), darkMode), [darkMode, storageKey])
  useEffect(() => writeSaved(storageKey('togetheros-members'), teamMembers), [teamMembers, storageKey])
  useEffect(() => writeSaved(storageKey('togetheros-profile-name'), profileName), [profileName, storageKey])
  useEffect(() => writeSaved(storageKey('togetheros-profile-email'), profileEmail), [profileEmail, storageKey])

  const exportBackup = () => {
    const backup: TogetherOSBackup = {
      app: 'TogetherOS',
      version: 1,
      createdAt: new Date().toISOString(),
      data: { tasks, workspaces, activities, teamMembers, profileName, profileEmail, darkMode },
    }

    try {
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `togetheros-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setBackupMessage('Backup exported successfully. Keep the JSON file somewhere safe.')
    } catch {
      setBackupMessage('Backup could not be exported. Please try again.')
    }
  }

  const importBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    if (!file) return

    try {
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('The backup file is too large. Maximum size is 5 MB.')
      }

      const parsed: unknown = JSON.parse(await file.text())
      if (!isTogetherOSBackup(parsed)) {
        throw new Error('This file is not a valid TogetherOS version 1 backup.')
      }

      const confirmed = window.confirm(
        'Restore this backup? Your current TogetherOS data on this browser will be replaced.'
      )
      if (!confirmed) {
        setBackupMessage('Restore cancelled. Your current data was not changed.')
        return
      }

      setTasks(parsed.data.tasks)
      setWorkspaces(parsed.data.workspaces)
      setActivities(parsed.data.activities)
      setTeamMembers(parsed.data.teamMembers)
      setProfileName(parsed.data.profileName)
      setProfileEmail(parsed.data.profileEmail)
      setDarkMode(parsed.data.darkMode)
      setSelectedWorkspaceId(null)
      setActivePage('Overview')
      setBackupMessage('Backup restored successfully.')
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : 'Could not read this backup file.')
    } finally {
      event.currentTarget.value = ''
    }
  }


  const completedTasks = tasks.filter(task => task.completed).length
  const pendingTasks = tasks.filter(task => !task.completed)
  const completion = tasks.length ? Math.round(completedTasks / tasks.length * 100) : 0

  // TOGETHEROS ANALYTICS V1 — derived only from real task data.
  const priorityStats = [
    { label: 'High', count: tasks.filter(task => task.priority === 'High').length, color: 'high' },
    { label: 'Medium', count: tasks.filter(task => task.priority === 'Medium').length, color: 'medium' },
    { label: 'Low', count: tasks.filter(task => task.priority === 'Low').length, color: 'low' },
  ]

  const workspaceStats = workspaces.map(workspace => {
    const related = tasks.filter(task => task.project === workspace.name)
    const done = related.filter(task => task.completed).length
    return {
      id: workspace.id,
      name: workspace.name,
      total: related.length,
      done,
      percent: related.length ? Math.round(done / related.length * 100) : 0,
      color: workspace.color,
    }
  })

  const openTaskCount = tasks.length - completedTasks

  const visibleTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesSearch = `${task.title} ${task.project} ${task.assignee ?? ''}`.toLowerCase().includes(search.toLowerCase())
      const overdue = !task.completed && task.date < currentDateKey
      const matchesFilter =
        taskFilter === 'All' ||
        (taskFilter === 'Pending' && !task.completed && !overdue) ||
        (taskFilter === 'Completed' && task.completed) ||
        (taskFilter === 'Overdue' && overdue)

      return matchesSearch && matchesFilter
    })
  }, [tasks, search, taskFilter, currentDateKey])

  const logActivity = (title: string, detail: string) => {
    setActivities(current => [
      { id: Date.now(), title, detail, time: new Date().toLocaleString() },
      ...current,
    ].slice(0, 30))
  }

  const openNewTask = () => {
    setEditingTask(null)
    setTaskTitle('')
    setTaskProject(workspaces[0]?.name ?? '')
    setTaskDate(currentDateKey)
    setTaskPriority('Medium')
    setTaskAssignee('')
    setShowTaskForm(true)
  }

  const openEditTask = (task: Task) => {
    setEditingTask(task)
    setTaskTitle(task.title)
    setTaskProject(task.project)
    setTaskDate(task.date)
    setTaskPriority(task.priority)
    setTaskAssignee(task.assignee ?? '')
    setShowTaskForm(true)
  }

  const saveTask = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormFeedback(null)
    if (!taskTitle.trim()) {
      setFormFeedback({ type: 'error', text: 'Please enter a task title.' })
      return
    }
    if (!taskProject.trim() || !workspaces.some(item => item.name === taskProject)) {
      setFormFeedback({ type: 'error', text: 'Please select a valid workspace.' })
      return
    }
    if (!taskDate) {
      setFormFeedback({ type: 'error', text: 'Please select a due date.' })
      return
    }

    if (editingTask) {
      setTasks(current => current.map(task => task.id === editingTask.id
        ? { ...task, title: taskTitle.trim(), project: taskProject, date: taskDate, priority: taskPriority, assignee: taskAssignee.trim() }
        : task))
      logActivity('Task updated', taskTitle.trim())
      setFormFeedback({ type: 'success', text: 'Task updated successfully.' })
    } else {
      setTasks(current => [...current, {
        id: Date.now(), title: taskTitle.trim(), project: taskProject,
        date: taskDate, completed: false, priority: taskPriority, assignee: taskAssignee.trim(),
      }])
      logActivity('Task created', taskTitle.trim())
      setFormFeedback({ type: 'success', text: 'Task created successfully.' })
    }
    setShowTaskForm(false)
  }

  const toggleTask = (id: number) => {
    const selected = tasks.find(task => task.id === id)
    if (!selected) return
    setTasks(current => current.map(task => task.id === id ? { ...task, completed: !task.completed } : task))
    logActivity(selected.completed ? 'Task reopened' : 'Task completed', selected.title)
  }

  const deleteTask = (task: Task) => {
    if (!window.confirm(`Delete "${task.title}"?`)) return
    setTasks(current => current.filter(item => item.id !== task.id))
    logActivity('Task deleted', task.title)
  }

  const openNewWorkspace = () => {
    setEditingWorkspace(null)
    setWorkspaceName('')
    setWorkspaceCategory('General')
    setShowWorkspaceForm(true)
  }

  const openEditWorkspace = (workspace: Workspace) => {
    setEditingWorkspace(workspace)
    setWorkspaceName(workspace.name)
    setWorkspaceCategory(workspace.category)
    setShowWorkspaceForm(true)
  }

  const saveWorkspace = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormFeedback(null)
    const cleanWorkspaceName = workspaceName.trim()
    if (!cleanWorkspaceName) {
      setFormFeedback({ type: 'error', text: 'Please enter a workspace name.' })
      return
    }
    if (workspaces.some(item => item.name.toLowerCase() === cleanWorkspaceName.toLowerCase() && item.id !== editingWorkspace?.id)) {
      setFormFeedback({ type: 'error', text: 'A workspace with this name already exists.' })
      return
    }

    if (editingWorkspace) {
      const oldName = editingWorkspace.name
      const newName = workspaceName.trim()

      setWorkspaces(current => current.map(item =>
        item.id === editingWorkspace.id
          ? { ...item, name: newName, category: workspaceCategory.trim() || 'General' }
          : item
      ))

      if (oldName !== newName) {
        setTasks(current => current.map(task =>
          task.project === oldName ? { ...task, project: newName } : task
        ))
      }

      logActivity('Workspace updated', newName)
      setFormFeedback({ type: 'success', text: 'Workspace updated successfully.' })
    } else {
      const workspace: Workspace = {
        id: Date.now(),
        name: workspaceName.trim(),
        category: workspaceCategory.trim() || 'General',
        members: 1,
        color: ['purple', 'blue', 'orange'][workspaces.length % 3] as Workspace['color'],
      }

      setWorkspaces(current => [...current, workspace])
      logActivity('Workspace created', workspace.name)
      setFormFeedback({ type: 'success', text: 'Workspace created successfully.' })
    }

    setWorkspaceName('')
    setWorkspaceCategory('General')
    setEditingWorkspace(null)
    setShowWorkspaceForm(false)
  }

  const addTeamMember = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormFeedback(null)
    const workspace = workspaces.find(item => item.id === selectedWorkspaceId)
    const cleanMemberName = memberName.trim()
    const cleanMemberEmail = memberEmail.trim().toLowerCase()
    if (!workspace) {
      setFormFeedback({ type: 'error', text: 'Please select a workspace first.' })
      return
    }
    if (!cleanMemberName || !cleanMemberEmail) {
      setFormFeedback({ type: 'error', text: 'Please enter the member name and email.' })
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanMemberEmail)) {
      setFormFeedback({ type: 'error', text: 'Please enter a valid email address.' })
      return
    }
    if (teamMembers.some(member => member.workspaceId === workspace.id && member.email.trim().toLowerCase() === cleanMemberEmail)) {
      setFormFeedback({ type: 'error', text: 'This email is already added to this workspace.' })
      return
    }
    setTeamMembers(current => [...current, {
      id: Date.now(),
      name: cleanMemberName,
      email: cleanMemberEmail,
      role: memberRole,
      workspaceId: workspace.id,
    }])
    logActivity('Team member added', `${cleanMemberName} joined ${workspace.name}`)
    setFormFeedback({ type: 'success', text: 'Team member added successfully.' })
    setMemberName('')
    setMemberEmail('')
    setMemberRole('Member')
    setShowMemberForm(false)
  }

  const removeTeamMember = (member: TeamMember) => {
    if (!window.confirm(`Remove ${member.name} from this workspace?`)) return
    setTeamMembers(current => current.filter(item => item.id !== member.id))
    logActivity('Team member removed', member.name)
  }

  const removeWorkspace = (workspace: Workspace) => {
    if (tasks.some(task => task.project === workspace.name)) {
      window.alert('Is workspace mein tasks hain. Pehle un tasks ko delete ya doosre workspace mein move karo.')
      return
    }
    if (!window.confirm(`Delete workspace "${workspace.name}"?`)) return
    setWorkspaces(current => current.filter(item => item.id !== workspace.id))
    setTeamMembers(current => current.filter(member => member.workspaceId !== workspace.id))
    if (selectedWorkspaceId === workspace.id) setSelectedWorkspaceId(null)
    logActivity('Workspace deleted', workspace.name)
  }

  const navItems = [
    { label: 'Overview', icon: '◫' },
    { label: 'My Tasks', icon: '✓' },
    { label: 'Workspaces', icon: '▦' },
    { label: 'Calendar', icon: '▣' },
    { label: 'Activity', icon: '↗' },
    { label: 'Settings', icon: '⚙' },
  ]

  const formatDate = (date: string) => {
    if (!date) return 'No date'
    return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  }

  const renderTaskList = (items: Task[]) => (
    <div className="task-list">
      {items.length === 0 ? (
        <div className="empty-state">No tasks here yet. Add a task to get started.</div>
      ) : items.map(task => (
        <div className={`task-row ${task.completed ? 'task-done' : ''}`} key={task.id}>
          <button className={`task-check ${task.completed ? 'checked' : ''}`}
            onClick={() => toggleTask(task.id)}
            aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}>
            {task.completed ? '✓' : ''}
          </button>
          <div className="task-details">
            <strong>{task.title}</strong>
            <span>{task.project} · {task.priority} priority{task.assignee ? ` · Assigned to ${task.assignee}` : ''}</span>
          </div>
          <span className={`task-date ${!task.completed && task.date < currentDateKey ? 'task-overdue' : ''}`}>
            {!task.completed && task.date < currentDateKey ? 'Overdue · ' : ''}{formatDate(task.date)}
          </span>
          <button className="more-button" onClick={() => openEditTask(task)} aria-label="Edit task">✎</button>
          <button className="more-button" onClick={() => deleteTask(task)} aria-label="Delete task">×</button>
        </div>
      ))}
    </div>
  )

  const renderWorkspaces = () => (
    <section className="workspace-grid">
      {workspaces.map(workspace => {
        const related = tasks.filter(task => task.project === workspace.name)
        const done = related.filter(task => task.completed).length
        const progress = related.length ? Math.round(done / related.length * 100) : 0
        return (
          <article className="project-card" key={workspace.id}>
            <div className="project-card-top">
              <div className={`project-icon ${workspace.color}`}>✦</div>
              <div className="workspace-card-actions">
                <button className="more-button" onClick={() => openEditWorkspace(workspace)} aria-label={`Edit ${workspace.name}`}>✎</button>
                <button className="more-button" onClick={() => removeWorkspace(workspace)} aria-label={`Delete ${workspace.name}`}>×</button>
              </div>
            </div>
            <button className="workspace-open-button" onClick={() => setSelectedWorkspaceId(workspace.id)}><h3>{workspace.name}</h3><span>Open workspace →</span></button>
            <p>{workspace.category}</p>
            <div className="project-progress-label"><span>Task progress</span><strong>{progress}%</strong></div>
            <div className="progress-track"><div className={`progress-fill ${workspace.color}`} style={{ width: `${progress}%` }} /></div>
            <div className="project-footer"><span>{related.length} tasks · {teamMembers.filter(member => member.workspaceId === workspace.id).length + 1} members</span><span>{done}/{related.length} done</span></div>
          </article>
        )
      })}
      <button className="project-card create-workspace-card" onClick={openNewWorkspace}>
        <span className="create-plus">＋</span>
        <strong>Create a workspace</strong>
        <span>Bring a team together</span>
      </button>
    </section>
  )

  const renderWorkspaceDetails = (workspace: Workspace) => {
    const relatedTasks = tasks.filter(task => task.project === workspace.name)
    const members = teamMembers.filter(member => member.workspaceId === workspace.id)
    const done = relatedTasks.filter(task => task.completed).length
    const progress = relatedTasks.length ? Math.round(done / relatedTasks.length * 100) : 0

    return <section className="workspace-detail">
      <button className="back-link" onClick={() => setSelectedWorkspaceId(null)}>← All workspaces</button>
      <div className="workspace-detail-hero panel">
        <div className={`project-icon ${workspace.color}`}>✦</div>
        <div className="workspace-detail-copy">
          <span className="eyebrow">WORKSPACE</span>
          <h2>{workspace.name}</h2>
          <p>{workspace.category}</p>
        </div>
        <button className="secondary-button" onClick={() => openEditWorkspace(workspace)}>✎ Edit workspace</button>
      </div>
      <div className="stats-grid workspace-stats">
        <div className="stat-card"><div className="stat-top"><span>Total tasks</span><span className="stat-icon violet-bg">✓</span></div><div className="stat-value">{relatedTasks.length}</div><div className="stat-foot">Tasks in this workspace</div></div>
        <div className="stat-card"><div className="stat-top"><span>Completed</span><span className="stat-icon green-bg">↗</span></div><div className="stat-value">{done}</div><div className="stat-foot">Finished tasks</div></div>
        <div className="stat-card"><div className="stat-top"><span>Team members</span><span className="stat-icon blue-bg">♙</span></div><div className="stat-value">{members.length + 1}</div><div className="stat-foot">Including workspace owner</div></div>
        <div className="stat-card"><div className="stat-top"><span>Progress</span><span className="stat-icon orange-bg">◎</span></div><div className="stat-value">{progress}%</div><div className="stat-foot">Overall completion</div></div>
      </div>
      <div className="workspace-detail-grid">
        <section className="panel">
          <div className="panel-heading"><div><h2>Workspace tasks</h2><p>Tasks belonging to this team.</p></div><button className="primary-button" onClick={() => { openNewTask(); setTaskProject(workspace.name) }}>＋ Add task</button></div>
          {renderTaskList(relatedTasks)}
        </section>
        <section className="panel">
          <div className="panel-heading"><div><h2>Team members</h2><p>Manage who belongs to this workspace.</p></div><button className="primary-button" onClick={() => setShowMemberForm(true)}>＋ Add</button></div>
          {members.length ? members.map(member => <div className="member-row" key={member.id}>
            <div className="member-avatar">{member.name.slice(0, 1).toUpperCase()}</div>
            <div className="member-info"><strong>{member.name}</strong><span>{member.email}</span></div>
            <span className="member-role">{member.role}</span>
            <button className="more-button" onClick={() => removeTeamMember(member)} aria-label={`Remove ${member.name}`}>×</button>
          </div>) : <div className="empty-state">No members added yet. Add your first teammate.</div>}
        </section>
      </div>
    </section>
  }

  const renderPage = () => {
    if (activePage === 'Settings') {
      return <section className="settings-grid">
        <div className="panel settings-panel"><div className="panel-heading"><div><h2>Profile</h2><p>Update the details shown in your workspace.</p></div></div>
          <label className="settings-field">Display name<input value={profileName} maxLength={40} onChange={event => setProfileName(event.target.value)} /></label>
          <label className="settings-field">Email address<input type="email" value={profileEmail} onChange={event => setProfileEmail(event.target.value)} placeholder="you@example.com" /></label>
          <div className="settings-note">Your profile changes are saved automatically on this device.</div>
        </div>
        <div className="panel settings-panel"><div className="panel-heading"><div><h2>Appearance</h2><p>Choose the look of your workspace.</p></div></div>
          <div className="setting-choice"><div><strong>Dark appearance</strong><span>Use a darker interface across TogetherOS.</span></div><button className={`toggle-switch ${darkMode ? 'on' : ''}`} onClick={() => setDarkMode(value => !value)} aria-label="Toggle dark appearance"><span /></button></div>
          <div className="setting-choice"><div><strong>Local data</strong><span>Your current workspace data is stored in this browser.</span></div><span className="local-badge">On device</span></div>
        </div>
        <div className="panel settings-panel backup-panel">
          <div className="panel-heading"><div><h2>Backup & Restore</h2><p>Keep a portable copy of your TogetherOS data.</p></div><span className="local-badge">JSON</span></div>
          <p className="backup-description">Your backup includes tasks, workspaces, team members, activity history, profile details and appearance preferences.</p>
          <div className="backup-actions">
            <button type="button" className="primary-button" onClick={exportBackup}>↓ Export backup</button>
            <button type="button" className="secondary-button" onClick={() => document.getElementById('togetheros-backup-file')?.click()}>↑ Import backup</button>
            <input id="togetheros-backup-file" className="backup-file-input" type="file" accept=".json,application/json" onChange={importBackup} />
          </div>
          <p className="backup-warning">Importing replaces the current data on this browser. Export a backup first if you may need to restore it later.</p>
          <p className="backup-message" role="status" aria-live="polite">{backupMessage || 'No backup action performed yet.'}</p>
        </div>
      </section>
    }

    if (activePage === 'My Tasks') {
      return <section className="panel">
        <div className="panel-heading"><div><h2>All my tasks</h2><p>Manage your work, one step at a time.</p></div>
          <button className="primary-button" onClick={openNewTask}>＋ Add task</button></div>
        <div className="task-filter-bar">
          {(['All', 'Pending', 'Completed', 'Overdue'] as const).map(filter => (
            <button key={filter}
              className={`task-filter ${taskFilter === filter ? 'active' : ''}`}
              onClick={() => setTaskFilter(filter)}>
              {filter}
              <span>{filter === 'All' ? tasks.length :
                filter === 'Completed' ? tasks.filter(task => task.completed).length :
                filter === 'Overdue' ? tasks.filter(task => !task.completed && task.date < currentDateKey).length :
                tasks.filter(task => !task.completed && task.date >= currentDateKey).length}</span>
            </button>
          ))}
        </div>
        {renderTaskList(visibleTasks)}
      </section>
    }

    if (activePage === 'Workspaces') {
      const selectedWorkspace = workspaces.find(item => item.id === selectedWorkspaceId)
      if (selectedWorkspace) return renderWorkspaceDetails(selectedWorkspace)
      return <><div className="panel-heading page-section-heading"><div><h2>Your workspaces</h2><p>Separate spaces for the things you do together.</p></div>
        <button className="primary-button" onClick={openNewWorkspace}>＋ New workspace</button></div>
        {renderWorkspaces()}</>
    }

    if (activePage === 'Calendar') {
      const year = calendarMonth.getFullYear()
      const month = calendarMonth.getMonth()
      const firstWeekday = new Date(year, month, 1).getDay()
      const daysInMonth = new Date(year, month + 1, 0).getDate()
      const todayKey = currentDateKey
      const dateKey = (day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const cells = [
        ...Array.from({ length: firstWeekday }, () => null),
        ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
      ]
      const selectedTasks = tasks.filter(task => task.date === selectedDate)

      return <section className="calendar-layout">
        <div className="panel calendar-panel">
          <div className="calendar-toolbar">
            <div>
              <h2>{calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
              <p>{tasks.filter(task => task.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)).length} scheduled tasks this month</p>
            </div>
            <div className="calendar-navigation">
              <button className="secondary-button" aria-label="Previous month"
                onClick={() => setCalendarMonth(new Date(year, month - 1, 1))}>←</button>
              <button className="secondary-button" onClick={() => {
                const now = new Date()
                setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1))
                setSelectedDate(todayKey)
              }}>Today</button>
              <button className="secondary-button" aria-label="Next month"
                onClick={() => setCalendarMonth(new Date(year, month + 1, 1))}>→</button>
            </div>
          </div>
          <div className="calendar-grid">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day =>
              <div className="calendar-weekday" key={day}>{day}</div>
            )}
            {cells.map((day, index) => {
              if (day === null) return <div className="calendar-day calendar-empty" key={`empty-${index}`} />
              const key = dateKey(day)
              const count = tasks.filter(task => task.date === key).length
              return <button key={key}
                className={`calendar-day ${selectedDate === key ? 'selected' : ''} ${todayKey === key ? 'today' : ''}`}
                onClick={() => setSelectedDate(key)}
                aria-label={`${day}, ${calendarMonth.toLocaleDateString(undefined, { month: 'long' })}, ${count} tasks`}>
                <span>{day}</span>
                {count > 0 && <span className="calendar-day-count">{count}</span>}
              </button>
            })}
          </div>
          <div className="calendar-legend"><span /> Dates with scheduled tasks</div>
        </div>

        <div className="panel selected-date-panel">
          <div className="panel-heading">
            <div>
              <h2>{formatDate(selectedDate)}</h2>
              <p>{selectedTasks.length} {selectedTasks.length === 1 ? 'task' : 'tasks'} scheduled</p>
            </div>
            <button className="primary-button" onClick={() => {
              setTaskDate(selectedDate)
              setEditingTask(null)
              setTaskTitle('')
              setTaskProject(workspaces[0]?.name ?? '')
              setTaskPriority('Medium')
              setTaskAssignee('')
              setShowTaskForm(true)
            }}>＋ Add task</button>
          </div>
          {renderTaskList(selectedTasks)}
        </div>
      </section>
    }

    if (activePage === 'Activity') {
      return <section className="panel"><div className="panel-heading"><div><h2>Activity history</h2><p>A timeline of changes in your space.</p></div></div>
        {activities.length ? activities.map(item => <div className="activity-item history-item" key={item.id}>
          <div className="activity-icon activity-purple">↗</div>
          <div><strong>{item.title}</strong><p>{item.detail}</p><span>{item.time}</span></div>
        </div>) : <div className="empty-state">Your activity will appear here.</div>}
      </section>
    }

    return <>
      <section className="stats-grid">
        <div className="stat-card"><div className="stat-top"><span>Open tasks</span><span className="stat-icon violet-bg">✓</span></div><div className="stat-value">{pendingTasks.length.toString().padStart(2, '0')}</div><div className="stat-foot">Ready for your attention</div></div>
        <div className="stat-card"><div className="stat-top"><span>Completed</span><span className="stat-icon green-bg">↗</span></div><div className="stat-value">{completedTasks.toString().padStart(2, '0')}</div><div className="stat-foot">Nice progress so far</div></div>
        <div className="stat-card"><div className="stat-top"><span>Workspaces</span><span className="stat-icon blue-bg">▦</span></div><div className="stat-value">{workspaces.length.toString().padStart(2, '0')}</div><div className="stat-foot">Your active teams</div></div>
        <div className="stat-card"><div className="stat-top"><span>Completion rate</span><span className="stat-icon orange-bg">◎</span></div><div className="stat-value">{completion}%</div><div className="stat-foot">Across all your tasks</div></div>
      </section>
      {/* TOGETHEROS ANALYTICS V1 */}
      <section className="analytics-grid">
        <div className="panel analytics-panel completion-panel">
          <div className="panel-heading">
            <div><h2>Task completion</h2><p>Your overall delivery progress.</p></div>
            <span className="analytics-period">ALL TIME</span>
          </div>
          <div className="completion-chart-wrap">
            <div className="completion-donut"
              style={{ background: `conic-gradient(#8067ed 0% ${completion}%, var(--chart-track) ${completion}% 100%)` }}>
              <div className="completion-donut-inner">
                <strong>{completion}%</strong>
                <span>Completed</span>
              </div>
            </div>
            <div className="completion-legend">
              <div><span className="legend-dot done-dot" /><span>Completed</span><strong>{completedTasks}</strong></div>
              <div><span className="legend-dot open-dot" /><span>Open</span><strong>{openTaskCount}</strong></div>
              <div className="legend-total"><span>Total tasks</span><strong>{tasks.length}</strong></div>
            </div>
          </div>
        </div>

        <div className="panel analytics-panel priority-panel">
          <div className="panel-heading">
            <div><h2>Priority breakdown</h2><p>Where your attention is needed.</p></div>
          </div>
          <div className="priority-chart-list">
            {priorityStats.map(item => (
              <div className="priority-chart-item" key={item.label}>
                <div className="priority-chart-label">
                  <span><i className={`priority-dot ${item.color}`} />{item.label}</span>
                  <strong>{item.count}</strong>
                </div>
                <div className="priority-track">
                  <div className={`priority-fill ${item.color}`}
                    style={{ width: `${tasks.length ? item.count / tasks.length * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="priority-chart-foot">
            <span>{tasks.length ? 'Based on all current tasks' : 'Add tasks to see your priorities'}</span>
            <strong>{tasks.length} total</strong>
          </div>
        </div>

        <div className="panel analytics-panel workspace-analytics-panel">
          <div className="panel-heading">
            <div><h2>Workspace progress</h2><p>Task completion across your spaces.</p></div>
            <button className="text-button" onClick={() => setActivePage('Workspaces')}>View all →</button>
          </div>
          {workspaceStats.length ? (
            <div className="workspace-progress-list">
              {workspaceStats.map(item => (
                <button className="workspace-progress-row" key={item.id}
                  onClick={() => {
                    setSelectedWorkspaceId(item.id)
                    setActivePage('Workspaces')
                  }}>
                  <span className={`workspace-progress-icon ${item.color}`}>✦</span>
                  <span className="workspace-progress-info">
                    <span className="workspace-progress-name">{item.name}</span>
                    <span className="workspace-progress-meta">{item.done} of {item.total} tasks completed</span>
                    <span className="workspace-progress-track">
                      <span className={`workspace-progress-fill ${item.color}`}
                        style={{ width: `${item.percent}%` }} />
                    </span>
                  </span>
                  <strong className="workspace-progress-percent">{item.percent}%</strong>
                </button>
              ))}
            </div>
          ) : <div className="empty-state">Create a workspace to see its progress here.</div>}
        </div>
      </section>

      <section className="content-grid">
        <div className="panel tasks-panel"><div className="panel-heading"><div><h2>Your tasks</h2><p>A little progress goes a long way.</p></div>
          <button className="text-button" onClick={() => setActivePage('My Tasks')}>View all →</button></div>
          {renderTaskList(visibleTasks.slice(0, 5))}
          <button className="add-task-button" onClick={openNewTask}>＋ Create a task</button>
        </div>
        <div className="panel activity-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>The latest from your space.</p></div>
          <button className="text-button" onClick={() => setActivePage('Activity')}>View all →</button></div>
          <div className="activity-list">{activities.slice(0, 4).map(item => <div className="activity-item" key={item.id}>
            <div className="activity-icon activity-purple">↗</div><div><strong>{item.title}</strong><p>{item.detail}</p><span>{item.time}</span></div>
          </div>)}</div>
        </div>
      </section>
      <section className="workspaces-section"><div className="panel-heading"><div><h2>Your workspaces</h2><p>Everything your teams are working on.</p></div>
        <button className="text-button" onClick={() => setActivePage('Workspaces')}>All workspaces →</button></div>
        {renderWorkspaces()}
      </section>
    </>
  }

  return (
    <div className={`app-shell ${darkMode ? 'dark' : ''}`}>
      <aside className="sidebar">
        <button className="brand brand-button" onClick={() => {
          setActivePage('Overview')
          setSelectedWorkspaceId(null)
        }}>
          <span className="brand-mark"><span>✦</span></span>
          <span className="brand-copy">
            <span className="brand-name">Together<span className="brand-light">OS</span></span>
            <span className="brand-tagline">One space. Everything in sync.</span>
          </span>
        </button>
        <div className="workspace-switcher-wrap">
          <button type="button" className="workspace-switcher workspace-switcher-button"
            onClick={() => {
      setShowWorkspaceMenu(value => !value)
      setShowNotifications(false)
      setShowProfileMenu(false)
    }}
            aria-expanded={showWorkspaceMenu} aria-label="Switch workspace">
            <span className="switcher-avatar">
              {selectedWorkspaceId !== null
                ? (workspaces.find(item => item.id === selectedWorkspaceId)?.name || 'W').charAt(0).toUpperCase()
                : 'P'}
            </span>
            <span className="switcher-info">
              <strong>{selectedWorkspaceId !== null
                ? (workspaces.find(item => item.id === selectedWorkspaceId)?.name || 'Workspace')
                : 'Personal space'}</strong>
              <span>{selectedWorkspaceId !== null
                ? (workspaces.find(item => item.id === selectedWorkspaceId)?.category || 'Team workspace')
                : `${workspaces.length} available workspaces`}</span>
            </span>
            <span className={`switcher-arrow ${showWorkspaceMenu ? 'is-open' : ''}`}>⌄</span>
          </button>
          {showWorkspaceMenu && <div className="workspace-switcher-menu">
            <div className="workspace-menu-heading">SWITCH WORKSPACE</div>
            <button type="button"
              className={`workspace-menu-item ${selectedWorkspaceId === null ? 'selected' : ''}`}
              onClick={() => {
                setSelectedWorkspaceId(null)
                setActivePage('Overview')
                setShowWorkspaceMenu(false)
              }}>
              <span className="workspace-menu-icon personal">P</span>
              <span><strong>Personal space</strong><small>Your overall dashboard</small></span>
              {selectedWorkspaceId === null && <span className="workspace-menu-check">✓</span>}
            </button>
            {workspaces.map(workspace => <button type="button" key={workspace.id}
              className={`workspace-menu-item ${selectedWorkspaceId === workspace.id ? 'selected' : ''}`}
              onClick={() => {
                setSelectedWorkspaceId(workspace.id)
                setActivePage('Workspaces')
                setShowWorkspaceMenu(false)
              }}>
              <span className={`workspace-menu-icon ${workspace.color}`}>{workspace.name.charAt(0).toUpperCase()}</span>
              <span><strong>{workspace.name}</strong><small>{workspace.category}</small></span>
              {selectedWorkspaceId === workspace.id && <span className="workspace-menu-check">✓</span>}
            </button>)}
            <div className="workspace-menu-divider" />
            <button type="button" className="workspace-menu-create" onClick={() => {
              setShowWorkspaceMenu(false)
              openNewWorkspace()
            }}>＋ Create a new workspace</button>
            <button type="button" className="workspace-menu-manage" onClick={() => {
              setActivePage('Workspaces')
              setShowWorkspaceMenu(false)
            }}>Manage all workspaces →</button>
          </div>}
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="navigation">{navItems.map(item => <button key={item.label}
          className={`nav-item ${activePage === item.label ? 'active' : ''}`} onClick={() => setActivePage(item.label)}>
          <span className="nav-icon">{item.icon}</span><span>{item.label}</span>
          {item.label === 'My Tasks' && <span className="nav-count">{pendingTasks.length}</span>}
        </button>)}</nav>
        <div className="nav-label second-label">YOUR WORKSPACES</div>
        <div className="workspace-links">{workspaces.slice(0, 5).map(workspace => <button key={workspace.id}
          className={`workspace-link ${selectedWorkspaceId === workspace.id && activePage === 'Workspaces' ? 'active' : ''}`}
          onClick={() => {
            setSelectedWorkspaceId(workspace.id)
            setActivePage('Workspaces')
            setShowWorkspaceMenu(false)
          }}>
          <span className={`workspace-dot ${workspace.color}`} /><span>{workspace.name}</span>
        </button>)}<button className="add-workspace" onClick={openNewWorkspace}>＋ Add workspace</button></div>
        <div className="sidebar-bottom"><button className="nav-item" onClick={() => setDarkMode(value => !value)}>
          <span className="nav-icon">{darkMode ? '☀' : '☾'}</span><span>{darkMode ? 'Light appearance' : 'Dark appearance'}</span>
        </button><div className="profile"><div className="profile-avatar">{(profileName || 'U').charAt(0).toUpperCase()}</div><div className="profile-info"><strong>{profileName || 'Your profile'}</strong><span>{profileEmail || 'Personal account'}</span></div><button type="button" className="signout-button" onClick={onSignOut} title="Sign out" aria-label="Sign out">↪</button></div></div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumb"><span>Workspace</span><span className="crumb-divider">/</span><strong>{activePage}</strong></div>
          <div className="topbar-actions">
            <label className="search-box"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search tasks..." /><kbd>⌘ K</kbd></label>
            <div className="notification-wrap">
              <button className="notification-button" onClick={() => {
      setShowNotifications(value => !value)
      setShowWorkspaceMenu(false)
      setShowProfileMenu(false)
    }}
                aria-label="Toggle notifications" aria-expanded={showNotifications}>
                ♧
                {activities.length > 0 && <span className="notification-dot" />}
              </button>
              {showNotifications && <div className="notification-popover">
                <div className="notification-heading">
                  <strong>Notifications</strong>
                  <button onClick={() => setShowNotifications(false)} aria-label="Close notifications">×</button>
                </div>
                {activities.length ? activities.slice(0, 5).map(item => (
                  <div className="notification-entry" key={item.id}>
                    <span className="notification-entry-icon">✦</span>
                    <div><strong>{item.title}</strong><p>{item.detail}</p><small>{item.time}</small></div>
                  </div>
                )) : <div className="empty-state">You're all caught up.</div>}
              </div>}
            </div>
            <div className="profile-menu-wrap">
            <button type="button" className="top-avatar"
              onClick={() => {
      setShowProfileMenu(value => !value)
      setShowWorkspaceMenu(false)
      setShowNotifications(false)
    }}
              aria-label="Open profile menu" aria-expanded={showProfileMenu}>
              {(profileName || 'U').charAt(0).toUpperCase()}
            </button>
            {showProfileMenu && <div className="profile-popover">
              <div className="profile-popover-user">
                <strong>{profileName || 'Your profile'}</strong>
                <span>{profileEmail || 'Personal account'}</span>
              </div>
              <button type="button" onClick={() => {
                setActivePage('Settings')
                setShowProfileMenu(false)
              }}>⚙ Account settings</button>
              <button type="button" className="profile-signout" onClick={() => {
                setShowProfileMenu(false)
                void onSignOut()
              }}>↪ Sign out</button>
            </div>}
          </div>
          </div>
        </header>
        <div className="page-content">
          <section className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR SPACE, IN SYNC</div>
            <h1>{activePage === 'Overview' ? `Good morning, ${profileName || 'there'}` : activePage}</h1>
            <p className="subtitle">{activePage === 'Overview' ? "Here's what's happening across your workspaces today." : `Everything you need to manage ${activePage.toLowerCase()}.`}</p>
          </div>{activePage !== 'Activity' && <button className="primary-button" onClick={activePage === 'Workspaces' ? () => setShowWorkspaceForm(true) : openNewTask}>＋ {activePage === 'Workspaces' ? 'New workspace' : 'Add task'}</button>}</section>
          {renderPage()}
          <footer className="footer"><span>© 2026 TogetherOS</span><span>Built for better teamwork <span className="footer-heart">♥</span></span></footer>
        </div>
      </main>

      {/* TOGETHEROS FORM FEEDBACK V1 */}
      {formFeedback && (
        <div className={`form-feedback-toast ${formFeedback.type}`}
          role={formFeedback.type === 'error' ? 'alert' : 'status'}
          aria-live={formFeedback.type === 'error' ? 'assertive' : 'polite'}>
          <span className="form-feedback-icon">{formFeedback.type === 'success' ? '✓' : '!'}</span>
          <span>{formFeedback.text}</span>
          <button type="button" aria-label="Dismiss message" onClick={() => setFormFeedback(null)}>×</button>
        </div>
      )}

      {showTaskForm && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowTaskForm(false) }}>
        <form className="app-modal" onSubmit={saveTask}>
          <div className="modal-heading"><div><h2>{editingTask ? 'Edit task' : 'Create a task'}</h2><p>Give your next step a clear direction.</p></div><button type="button" className="modal-close" onClick={() => setShowTaskForm(false)}>×</button></div>
          <label>Task title<input autoFocus required maxLength={100} value={taskTitle} onChange={event => setTaskTitle(event.target.value)} placeholder="e.g. Prepare project presentation" /></label>
          <label>Workspace<select required value={taskProject} onChange={event => setTaskProject(event.target.value)}>{workspaces.map(workspace => <option key={workspace.id} value={workspace.name}>{workspace.name}</option>)}</select></label>
          <label>Assign to (optional)<input maxLength={60} list="workspace-assignee-options" value={taskAssignee} onChange={event => setTaskAssignee(event.target.value)} placeholder="Teammate name" />
            <datalist id="workspace-assignee-options">
              {teamMembers.filter(member => workspaces.find(workspace => workspace.name === taskProject)?.id === member.workspaceId).map(member => <option key={member.id} value={member.name} />)}
            </datalist>
          </label>
          <div className="modal-fields"><label>Due date<input type="date" required value={taskDate} onChange={event => setTaskDate(event.target.value)} /></label>
            <label>Priority<select value={taskPriority} onChange={event => setTaskPriority(event.target.value as Task['priority'])}><option>Low</option><option>Medium</option><option>High</option></select></label></div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowTaskForm(false)}>Cancel</button><button className="primary-button" type="submit">{editingTask ? 'Save changes' : 'Create task'}</button></div>
        </form>
      </div>}

      {showMemberForm && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowMemberForm(false) }}>
        <form className="app-modal" onSubmit={addTeamMember}>
          <div className="modal-heading"><div><h2>Add team member</h2><p>Add a teammate to this workspace.</p></div><button type="button" className="modal-close" onClick={() => setShowMemberForm(false)}>×</button></div>
          <label>Full name<input autoFocus required maxLength={60} value={memberName} onChange={event => setMemberName(event.target.value)} placeholder="Teammate name" /></label>
          <label>Email address<input required type="email" value={memberEmail} onChange={event => setMemberEmail(event.target.value)} placeholder="teammate@example.com" /></label>
          <label>Workspace role<select value={memberRole} onChange={event => setMemberRole(event.target.value as TeamMember['role'])}><option>Member</option><option>Admin</option></select></label>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowMemberForm(false)}>Cancel</button><button className="primary-button" type="submit">Add member</button></div>
        </form>
      </div>}

      {showWorkspaceForm && <div className="modal-backdrop">
        <form className="app-modal" onSubmit={saveWorkspace}>
          <div className="modal-heading"><div><h2>{editingWorkspace ? 'Edit workspace' : 'Create workspace'}</h2><p>Give your team a shared place to work.</p></div><button type="button" className="modal-close" onClick={() => setShowWorkspaceForm(false)}>×</button></div>
          <label>Workspace name<input autoFocus required maxLength={50} value={workspaceName} onChange={event => setWorkspaceName(event.target.value)} placeholder="e.g. Design team" /></label>
          <label>Category<input value={workspaceCategory} onChange={event => setWorkspaceCategory(event.target.value)} placeholder="e.g. College society" /></label>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowWorkspaceForm(false)}>Cancel</button><button className="primary-button" type="submit">{editingWorkspace ? 'Save changes' : 'Create workspace'}</button></div>
        </form>
      </div>}
    </div>
  )

}

type AuthMode = 'login' | 'signup'

function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    setErrorMessage('')

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: name.trim() },
          },
        })

        if (error) throw error

        if (!data.session) {
          setMessage('Account created. Please check your email to confirm your account, then log in.')
        } else {
          setMessage('Account created successfully.')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

        if (error) throw error
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Something went wrong. Please try again.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand-mark">t</span>
          <span>together<span className="auth-brand-light">os</span></span>
        </div>

        <div className="auth-heading">
          <span className="auth-eyebrow">YOUR TEAM'S SHARED SPACE</span>
          <h1>{mode === 'login' ? 'Welcome back.' : 'Bring your team together.'}</h1>
          <p>
            {mode === 'login'
              ? 'Sign in to continue where your team left off.'
              : 'Create your account and start organising work together.'}
          </p>
        </div>

        <div className="auth-tabs">
          <button type="button" className={mode === 'login' ? 'selected' : ''}
            onClick={() => { setMode('login'); setMessage(''); setErrorMessage('') }}>
            Log in
          </button>
          <button type="button" className={mode === 'signup' ? 'selected' : ''}
            onClick={() => { setMode('signup'); setMessage(''); setErrorMessage('') }}>
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <label>
              Your name
              <input required autoComplete="name" maxLength={60}
                value={name} onChange={event => setName(event.target.value)}
                placeholder="Enter your name" />
            </label>
          )}

          <label>
            Email address
            <input required type="email" autoComplete="email"
              value={email} onChange={event => setEmail(event.target.value)}
              placeholder="you@example.com" />
          </label>

          <label>
            Password
            <input required type="password"
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password} onChange={event => setPassword(event.target.value)}
              placeholder="At least 8 characters" />
          </label>

          {errorMessage && <p className="auth-message auth-error" role="alert">{errorMessage}</p>}
          {message && <p className="auth-message auth-success" role="status">{message}</p>}

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? 'Please wait...' : mode === 'login' ? 'Sign in to TogetherOS' : 'Create your account'}
            {!busy && <span>→</span>}
          </button>
        </form>

        <p className="auth-footer">
          By continuing, you agree to use TogetherOS responsibly with your team.
        </p>
      </section>
      <div className="auth-decoration auth-decoration-one" />
      <div className="auth-decoration auth-decoration-two" />
    </main>
  )
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!mounted) return
        setSession(nextSession)
        setAuthLoading(false)
      }
    )

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return
      if (error) console.error('Could not restore Supabase session:', error)
      setSession(data.session)
      setAuthLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Sign out failed:', error)
      window.alert('Could not sign out. Please try again.')
    }
  }

  if (authLoading) {
    return (
      <main className="auth-loading">
        <div className="auth-loading-mark">t</div>
        <span>Preparing your workspace...</span>
      </main>
    )
  }

  if (!session) return <AuthScreen />

  const user = session.user
  const userName =
    typeof user.user_metadata?.display_name === 'string'
      ? user.user_metadata.display_name
      : ''

  return (
    <WorkspaceApp
      key={user.id}
      userId={user.id}
      userEmail={user.email ?? ''}
      userName={userName}
      onSignOut={handleSignOut}
    />
  )
}

export default App
