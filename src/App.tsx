import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import './App.css'

type UpdaterStatus = {
  state: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  message: string
  version?: string
  percent?: number
}

type Task = {
  id: number
  cloudId?: string
  title: string
  project: string
  date: string
  completed: boolean
  priority: 'Low' | 'Medium' | 'High'
  assignee?: string
  time?: string
  reminderMinutes?: number | number[]
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

type AppNotification = {
  id: string
  title: string
  detail: string
  createdAt: string
  read: boolean
  taskId?: number
  kind: 'reminder' | 'system'
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
  version: 1 | 2
  createdAt: string
  data: {
    tasks: Task[]
    deletedTasks?: Task[]
    workspaces: Workspace[]
    activities: Activity[]
    teamMembers: TeamMember[]
    profileName: string
    profileEmail: string
    darkMode: boolean
    accentColor?: 'violet' | 'blue' | 'teal' | 'rose'
    ambientMotion?: boolean
    animationIntensity?: 'soft' | 'balanced' | 'vivid'
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
    (value.assignee === undefined || typeof value.assignee === 'string') &&
    (value.time === undefined || (typeof value.time === 'string' && /^\d{2}:\d{2}$/.test(value.time))) &&
    (value.reminderMinutes === undefined ||
      (typeof value.reminderMinutes === 'number' && Number.isFinite(value.reminderMinutes) && value.reminderMinutes >= 0) ||
      (Array.isArray(value.reminderMinutes) && value.reminderMinutes.every(item => typeof item === 'number' && Number.isFinite(item) && item > 0 && item <= 43200)))
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
  if (!isRecord(value) || value.app !== 'TogetherOS' ||
      (value.version !== 1 && value.version !== 2)) return false
  if (!isRecord(value.data)) return false

  const data = value.data
  const baseValid =
    Array.isArray(data.tasks) && data.tasks.every(isTask) &&
    Array.isArray(data.workspaces) && data.workspaces.every(isWorkspace) &&
    Array.isArray(data.activities) && data.activities.every(isActivity) &&
    Array.isArray(data.teamMembers) && data.teamMembers.every(isTeamMember) &&
    typeof data.profileName === 'string' &&
    typeof data.profileEmail === 'string' &&
    typeof data.darkMode === 'boolean'

  if (!baseValid) return false
  if (value.version === 1) return true

  return Array.isArray(data.deletedTasks) &&
    data.deletedTasks.every(isTask) &&
    ['violet', 'blue', 'teal', 'rose'].includes(String(data.accentColor)) &&
    typeof data.ambientMotion === 'boolean' &&
    ['soft', 'balanced', 'vivid'].includes(String(data.animationIntensity))
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
  // TOGETHEROS APPEARANCE CUSTOMIZATION V1
  const [accentColor, setAccentColor] = useState<'violet' | 'blue' | 'teal' | 'rose'>(
    () => readSaved(storageKey('togetheros-accent'), 'violet')
  )
  const [ambientMotion, setAmbientMotion] = useState(
    () => readSaved(storageKey('togetheros-ambient-motion'), true)
  )
  const [animationIntensity, setAnimationIntensity] = useState<'soft' | 'balanced' | 'vivid'>(
    () => readSaved(storageKey('togetheros-animation-intensity'), 'soft')
  )

  const [tasks, setTasks] = useState<Task[]>(() => readSaved(storageKey('togetheros-tasks'), starterTasks))
  const [deletedTasks, setDeletedTasks] = useState<Task[]>(
    () => readSaved(storageKey('togetheros-deleted-tasks'), [])
  )
  useEffect(() => writeSaved(storageKey('togetheros-deleted-tasks'), deletedTasks), [deletedTasks, storageKey])
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => readSaved(storageKey('togetheros-workspaces'), starterWorkspaces))
  const [activities, setActivities] = useState<Activity[]>(() => readSaved(storageKey('togetheros-activity'), [
    { id: 1, title: 'Workspace created', detail: 'Website Redesign was added', time: 'Getting started' },
    { id: 2, title: 'Task completed', detail: 'Prepare team presentation', time: 'Sample activity' },
  ]))
  const [notifications, setNotifications] = useState<AppNotification[]>(
    () => readSaved(storageKey('togetheros-notifications'), [])
  )
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
  const [updaterStatus, setUpdaterStatus] = useState<UpdaterStatus | null>(null)

  useEffect(() => {
    const updater = window.togetherOS?.updater
    if (!updater) return
    return updater.onStatus(setUpdaterStatus)
  }, [])
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
  const [taskTime, setTaskTime] = useState('09:00')
  const [taskReminder, setTaskReminder] = useState(false)
  const [taskReminderMinutes, setTaskReminderMinutes] = useState<number[]>([10])
  const [customReminderMinutes, setCustomReminderMinutes] = useState('60')
  const reminderAudioRef = useRef<AudioContext | null>(null)
  const firedRemindersRef = useRef<Set<string>>(new Set())
  const [taskPriority, setTaskPriority] = useState<Task['priority']>('Medium')
  const [workspaceName, setWorkspaceName] = useState('')
  const [workspaceCategory, setWorkspaceCategory] = useState('General')


  useEffect(() => writeSaved(storageKey('togetheros-tasks'), tasks), [tasks, storageKey])
  useEffect(() => writeSaved(storageKey('togetheros-workspaces'), workspaces), [workspaces, storageKey])
  useEffect(() => writeSaved(storageKey('togetheros-activity'), activities), [activities, storageKey])
  useEffect(() => writeSaved(storageKey('togetheros-notifications'), notifications), [notifications, storageKey])
  useEffect(() => writeSaved(storageKey('togetheros-theme'), darkMode), [darkMode, storageKey])
  useEffect(() => writeSaved(storageKey('togetheros-accent'), accentColor), [accentColor, storageKey])
  useEffect(() => writeSaved(storageKey('togetheros-ambient-motion'), ambientMotion), [ambientMotion, storageKey])
  useEffect(() => writeSaved(storageKey('togetheros-animation-intensity'), animationIntensity), [animationIntensity, storageKey])

  useEffect(() => writeSaved(storageKey('togetheros-members'), teamMembers), [teamMembers, storageKey])
  useEffect(() => writeSaved(storageKey('togetheros-profile-name'), profileName), [profileName, storageKey])
  useEffect(() => writeSaved(storageKey('togetheros-profile-email'), profileEmail), [profileEmail, storageKey])

  const exportBackup = () => {
    const backup: TogetherOSBackup = {
      app: 'TogetherOS',
      version: 2,
      createdAt: new Date().toISOString(),
      data: {
        tasks, deletedTasks, workspaces, activities, teamMembers,
        profileName, profileEmail, darkMode, accentColor, ambientMotion, animationIntensity,
      },
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
        throw new Error('This file is not a valid TogetherOS backup (version 1 or 2).')
      }

      const confirmed = window.confirm(
        'Restore this backup? Your current TogetherOS data on this browser will be replaced.'
      )
      if (!confirmed) {
        setBackupMessage('Restore cancelled. Your current data was not changed.')
        return
      }

      setTasks(parsed.data.tasks)
      setDeletedTasks(parsed.data.deletedTasks ?? [])
      setWorkspaces(parsed.data.workspaces)
      setActivities(parsed.data.activities)
      setTeamMembers(parsed.data.teamMembers)
      setProfileName(parsed.data.profileName)
      setProfileEmail(parsed.data.profileEmail)
      setDarkMode(parsed.data.darkMode)
      if (parsed.data.accentColor) setAccentColor(parsed.data.accentColor)
      if (typeof parsed.data.ambientMotion === 'boolean') setAmbientMotion(parsed.data.ambientMotion)
      if (parsed.data.animationIntensity) setAnimationIntensity(parsed.data.animationIntensity)
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
  const dueTodayCount = tasks.filter(task =>
    !task.completed && task.date === currentDateKey
  ).length
  const upcomingTaskCount = tasks.filter(task =>
    !task.completed && task.date > currentDateKey
  ).length

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

  useEffect(() => {
    const formatReminder = (minutes: number) => {
      if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`
      if (minutes < 1440) {
        const hours = minutes / 60
        return `${hours} hour${hours === 1 ? '' : 's'}`
      }
      const days = minutes / 1440
      return `${days} day${days === 1 ? '' : 's'}`
    }

    const playReminderSound = async () => {
      try {
        let audio = reminderAudioRef.current
        if (!audio && typeof window.AudioContext !== 'undefined') {
          audio = new window.AudioContext()
          reminderAudioRef.current = audio
        }
        if (!audio) return
        if (audio.state === 'suspended') await audio.resume()
        if (audio.state !== 'running') return

        const oscillator = audio.createOscillator()
        const gain = audio.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(880, audio.currentTime)
        gain.gain.setValueAtTime(0.0001, audio.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.12, audio.currentTime + 0.03)
        gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.55)
        oscillator.connect(gain)
        gain.connect(audio.destination)
        oscillator.start()
        oscillator.stop(audio.currentTime + 0.6)
      } catch (error) {
        console.warn('TogetherOS reminder sound could not play:', error)
      }
    }

    const checkReminders = () => {
      const now = Date.now()

      for (const task of tasks) {
        if (task.completed || !task.time || task.reminderMinutes === undefined) continue

        const dueAt = new Date(`${task.date}T${task.time}:00`).getTime()
        if (!Number.isFinite(dueAt)) continue

        const reminderValues = Array.isArray(task.reminderMinutes)
          ? task.reminderMinutes
          : [task.reminderMinutes]

        for (const minutes of reminderValues) {
          if (!Number.isFinite(minutes) || minutes <= 0) continue

          const reminderKey = `${task.id}:${dueAt}:${minutes}`
          if (firedRemindersRef.current.has(reminderKey)) continue

          const reminderAt = dueAt - minutes * 60 * 1000
          // Small recovery window: don't silently lose a reminder
          // if the app wakes up shortly after its scheduled due time.
          if (now > dueAt + 5 * 60 * 1000) {
            firedRemindersRef.current.add(reminderKey)
            continue
          }
          if (now < reminderAt) continue

          firedRemindersRef.current.add(reminderKey)

          const notificationId = `reminder:${reminderKey}`
          setNotifications(current => current.some(item => item.id === notificationId)
            ? current
            : [{
                id: notificationId,
                title: 'Task reminder',
                detail: `${task.title} is due in ${formatReminder(minutes)}.`,
                createdAt: new Date().toISOString(),
                read: false,
                taskId: task.id,
                kind: 'reminder' as const,
              }, ...current].slice(0, 100))

          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification('TogetherOS reminder', {
                body: `${task.title} is due in ${formatReminder(minutes)}.`,
                tag: `togetheros-task-${task.id}-${minutes}`,
              })
            } catch (error) {
              console.warn('TogetherOS notification could not be shown:', error)
            }
          }

          void playReminderSound()
        }
      }
    }

    checkReminders()
    const interval = window.setInterval(checkReminders, 5000)
    return () => window.clearInterval(interval)
  }, [tasks])

  const openNewTask = () => {
    setEditingTask(null)
    setTaskTitle('')
    setTaskProject(workspaces[0]?.name ?? '')
    setTaskDate(currentDateKey)
    setTaskTime('09:00')
    setTaskReminder(false)
    setTaskReminderMinutes([10])
    setCustomReminderMinutes('60')
    setTaskPriority('Medium')
    setTaskAssignee('')
    setShowTaskForm(true)
  }

  const openEditTask = (task: Task) => {
    setEditingTask(task)
    setTaskTitle(task.title)
    setTaskProject(task.project)
    setTaskDate(task.date)
    setTaskTime(task.time ?? '09:00')
    setTaskReminder(task.reminderMinutes !== undefined)
    setTaskReminderMinutes(task.reminderMinutes === undefined
      ? [10]
      : (Array.isArray(task.reminderMinutes) ? task.reminderMinutes : [task.reminderMinutes]))
    setCustomReminderMinutes('60')
    setTaskPriority(task.priority)
    setTaskAssignee(task.assignee ?? '')
    setShowTaskForm(true)
  }

  const saveTask = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormFeedback(null)

    if (taskReminder) {
      if (!taskTime) {
        setFormFeedback({ type: 'error', text: 'Please select a due time for reminders.' })
        return
      }
      if (taskReminderMinutes.length === 0) {
        setFormFeedback({ type: 'error', text: 'Select at least one reminder timing.' })
        return
      }
      try {
        if (!reminderAudioRef.current && typeof window.AudioContext !== 'undefined') {
          reminderAudioRef.current = new window.AudioContext()
        }
        if (reminderAudioRef.current?.state === 'suspended') {
          void reminderAudioRef.current.resume().catch(error => {
            console.warn('TogetherOS could not activate reminder sound:', error)
          })
        }
      } catch (error) {
        console.warn('TogetherOS could not prepare reminder sound:', error)
      }
      if ('Notification' in window && Notification.permission === 'default') {
        void Notification.requestPermission().catch(error => {
          console.warn('TogetherOS notification permission was not granted:', error)
        })
      }
    }
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
        ? { ...task, title: taskTitle.trim(), project: taskProject, date: taskDate, time: taskReminder ? taskTime : undefined, reminderMinutes: taskReminder ? [...taskReminderMinutes] : undefined, priority: taskPriority, assignee: taskAssignee.trim() }
        : task))
      logActivity('Task updated', taskTitle.trim())
      setFormFeedback({ type: 'success', text: 'Task updated successfully.' })
    } else {
      setTasks(current => [...current, {
        id: Date.now(), title: taskTitle.trim(), project: taskProject,
        date: taskDate, time: taskReminder ? taskTime : undefined,
        reminderMinutes: taskReminder ? [...taskReminderMinutes] : undefined,
        completed: false, priority: taskPriority, assignee: taskAssignee.trim(),
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
    if (!window.confirm(`Move "${task.title}" to Recycle Bin?`)) return
    setTasks(current => current.filter(item => item.id !== task.id))
    setDeletedTasks(current => [task, ...current.filter(item => item.id !== task.id)])
    logActivity('Task moved to Recycle Bin', task.title)
  }

  const restoreTask = (task: Task) => {
    setTasks(current => current.some(item => item.id === task.id)
      ? current
      : [...current, task])
    setDeletedTasks(current => current.filter(item => item.id !== task.id))
    logActivity('Task restored', task.title)
  }

  const permanentlyDeleteTask = (task: Task) => {
    if (!window.confirm(`Permanently delete "${task.title}"? This cannot be undone.`)) return
    setDeletedTasks(current => current.filter(item => item.id !== task.id))
    logActivity('Task permanently deleted', task.title)
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
    { label: 'Recycle Bin', icon: '♲' },
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
          <div className="setting-choice"><div><strong>Dark appearance</strong><span>Use a darker interface across KARYA.</span></div><button className={`toggle-switch ${darkMode ? 'on' : ''}`} onClick={() => setDarkMode(value => !value)} aria-label="Toggle dark appearance"><span /></button></div>

          <div className="appearance-control">
            <div><strong>Accent colour</strong><span>Choose the highlight colour for your workspace.</span></div>
            <div className="accent-picker" role="group" aria-label="Accent colour">
              {(['violet', 'blue', 'teal', 'rose'] as const).map(color => (
                <button type="button" key={color}
                  className={`accent-swatch ${color} ${accentColor === color ? 'selected' : ''}`}
                  onClick={() => setAccentColor(color)}
                  aria-label={`${color} accent`}
                  aria-pressed={accentColor === color} />
              ))}
            </div>
          </div>

          <div className="setting-choice">
            <div><strong>Animated background</strong><span>Subtle ambient colour movement behind your workspace.</span></div>
            <button className={`toggle-switch ${ambientMotion ? 'on' : ''}`}
              onClick={() => setAmbientMotion(value => !value)}
              aria-label="Toggle animated background"><span /></button>
          </div>

          <div className="appearance-control">
            <div><strong>Animation intensity</strong><span>Keep effects comfortable and lightweight.</span></div>
            <div className="intensity-options">
              {(['soft', 'balanced', 'vivid'] as const).map(level => (
                <button type="button" key={level}
                  className={animationIntensity === level ? 'selected' : ''}
                  onClick={() => setAnimationIntensity(level)}>{level.charAt(0).toUpperCase() + level.slice(1)}</button>
              ))}
            </div>
          </div>

          <div className="setting-choice"><div><strong>Local data</strong><span>Your current workspace data is stored in this browser.</span></div><span className="local-badge">On device</span></div>
        </div>
        <div className="panel settings-panel backup-panel">
          <div className="panel-heading"><div><h2>Backup & Restore</h2><p>Keep a portable copy of your KARYA data.</p></div><span className="local-badge">JSON</span></div>
          <p className="backup-description">Your backup includes tasks, workspaces, team members, activity history, profile details and appearance preferences.</p>
          <div className="backup-actions">
            <button type="button" className="primary-button" onClick={exportBackup}>↓ Export backup</button>
            <button type="button" className="secondary-button" onClick={() => document.getElementById('togetheros-backup-file')?.click()}>↑ Import backup</button>
            <input id="togetheros-backup-file" className="backup-file-input" type="file" accept=".json,application/json" onChange={importBackup} />
          </div>
          <p className="backup-warning">Importing replaces the current data on this browser. Export a backup first if you may need to restore it later.</p>
          <p className="backup-message" role="status" aria-live="polite">{backupMessage || 'No backup action performed yet.'}</p>
        </div>

        {window.togetherOS?.updater && <div className="panel settings-panel updater-panel">
          <div className="panel-heading">
            <div><h2>KARYA Update Center</h2><p>Manage desktop app updates.</p></div>
            <span className="local-badge">DESKTOP</span>
          </div>

          <div className="updater-intro">
            <span className="updater-icon">↻</span>
            <div><strong>Keep KARYA up to date</strong><p>Check and install the latest available version.</p></div>
          </div>

          {updaterStatus && <div className={`updater-status updater-${updaterStatus.state}`} role="status" aria-live="polite">
            <span className="updater-dot" />{updaterStatus.message}
            {updaterStatus.version && <strong>v{updaterStatus.version}</strong>}
          </div>}

          {updaterStatus?.state === 'downloading' && <div className="updater-progress">
            <div><span>Downloading</span><strong>{updaterStatus.percent ?? 0}%</strong></div>
            <progress max="100" value={updaterStatus.percent ?? 0} />
          </div>}

          <div className="updater-actions">
            <button type="button" className="primary-button"
              disabled={updaterStatus?.state === 'checking' || updaterStatus?.state === 'downloading'}
              onClick={async () => {
                setUpdaterStatus({state:'checking', message:'Checking for updates...'})
                try {
                  const r = await window.togetherOS?.updater?.checkForUpdates()
                  if (r && !r.ok) setUpdaterStatus({state:'error', message:r.message || 'Update check failed.'})
                } catch (e) {
                  setUpdaterStatus({state:'error', message:e instanceof Error ? e.message : 'Update check failed.'})
                }
              }}>
              {updaterStatus?.state === 'checking' ? 'Checking...' : '↻ Check for updates'}
            </button>

            {updaterStatus?.state === 'available' && <button type="button" className="secondary-button"
              onClick={async () => {
                try {
                  const r = await window.togetherOS?.updater?.downloadUpdate()
                  if (r && !r.ok) setUpdaterStatus({state:'error', message:r.message || 'Download failed.'})
                } catch (e) {
                  setUpdaterStatus({state:'error', message:e instanceof Error ? e.message : 'Download failed.'})
                }
              }}>↓ Download update</button>}

            {updaterStatus?.state === 'downloaded' && <button type="button" className="primary-button"
              onClick={async () => {
                try {
                  const r = await window.togetherOS?.updater?.installUpdate()
                  if (r && !r.ok) setUpdaterStatus({state:'error', message:r.message || 'Install failed.'})
                } catch (e) {
                  setUpdaterStatus({state:'error', message:e instanceof Error ? e.message : 'Restart failed.'})
                }
              }}>↻ Restart to update</button>}
          </div>
          <p className="updater-note">Save your work before restarting to install an update.</p>
        </div>}
      </section>
    }

    if (activePage === 'Recycle Bin') {
      return <section className="panel recycle-bin-panel">
        <div className="panel-heading">
          <div>
            <h2>Recycle Bin</h2>
            <p>{deletedTasks.length} deleted task{deletedTasks.length === 1 ? '' : 's'} · Restore tasks or permanently remove them.</p>
          </div>
          <button type="button" className="secondary-button"
            disabled={deletedTasks.length === 0}
            onClick={() => {
              if (window.confirm('Permanently delete every task in the Recycle Bin? This cannot be undone.')) {
                setDeletedTasks([])
              }
            }}>Empty bin</button>
        </div>
        {deletedTasks.length === 0 ? (
          <div className="empty-state">Your Recycle Bin is empty. Deleted tasks will appear here.</div>
        ) : (
          <div className="task-list">
            {deletedTasks.map(task => (
              <div className="task-row recycle-bin-row" key={task.id}>
                <div className="task-details">
                  <strong>{task.title}</strong>
                  <span>{task.project} · {task.priority} priority · {formatDate(task.date)}</span>
                </div>
                <button type="button" className="secondary-button"
                  onClick={() => restoreTask(task)}>↶ Restore</button>
                <button type="button" className="more-button"
                  aria-label={`Permanently delete ${task.title}`}
                  onClick={() => permanentlyDeleteTask(task)}>×</button>
              </div>
            ))}
          </div>
        )}
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
              setTaskTime('09:00')
              setTaskReminder(false)
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

    if (activePage === 'Notification Center') {
      const unreadCount = notifications.filter(item => !item.read).length

      return <section className="panel notification-center">
        <div className="panel-heading">
          <div>
            <h2>Notification Center</h2>
            <p>{unreadCount} unread notification{unreadCount === 1 ? '' : 's'} · Your recent reminders and updates.</p>
          </div>
          <div className="notification-center-toolbar">
            <button
              type="button"
              className="secondary-button"
              disabled={unreadCount === 0}
              onClick={() => setNotifications(current => current.map(item => ({ ...item, read: true })))}
            >
              Mark all as read
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={notifications.length === 0}
              onClick={() => setNotifications([])}
            >
              Clear all
            </button>
          </div>
        </div>

        {notifications.length ? (
          <div className="notification-center-list">
            {notifications.map(item => (
              <article
                className={`notification-center-item ${item.read ? '' : 'notification-center-unread'}`}
                key={item.id}
              >
                <span className="notification-center-icon">
                  {item.kind === 'reminder' ? '◷' : '✦'}
                </span>
                <div className="notification-center-content">
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  <small>{new Date(item.createdAt).toLocaleString()}</small>
                  {item.taskId !== undefined && (
                    <button
                      type="button"
                      className="notification-open-task"
                      onClick={() => {
                        setNotifications(current => current.map(notification =>
                          notification.id === item.id ? { ...notification, read: true } : notification
                        ))
                        setTaskFilter('All')
                        setActivePage('My Tasks')
                      }}
                    >
                      View tasks
                    </button>
                  )}
                </div>
                <div className="notification-center-actions">
                  {!item.read && (
                    <button
                      type="button"
                      className="notification-action-button"
                      onClick={() => setNotifications(current => current.map(notification =>
                        notification.id === item.id ? { ...notification, read: true } : notification
                      ))}
                    >
                      Mark read
                    </button>
                  )}
                  <button
                    type="button"
                    className="notification-action-button notification-delete-button"
                    aria-label={`Delete notification: ${item.title}`}
                    onClick={() => setNotifications(current =>
                      current.filter(notification => notification.id !== item.id)
                    )}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state notification-empty-state">
            <span className="notification-empty-icon">♧</span>
            <strong>You're all caught up!</strong>
            <p>New task reminders and updates will appear here.</p>
          </div>
        )}
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

        <div className="panel analytics-panel progress-pulse-panel">
          <div className="panel-heading">
            <div><h2>Live progress pulse</h2><p>A visual snapshot of your current task completion.</p></div>
            <span className="analytics-period">LIVE</span>
          </div>
          <div className="progress-pulse-visual" aria-label={`Current task completion: ${completion} percent`}>
            <svg viewBox="0 0 520 150" role="img" aria-label="Decorative intersecting progress waves">
              <defs>
                <linearGradient id="pulseWaveOne" x1="0" x2="1">
                  <stop offset="0%" stopColor="var(--accent)" />
                  <stop offset="100%" stopColor="var(--accent-secondary)" />
                </linearGradient>
                <linearGradient id="pulseWaveTwo" x1="0" x2="1">
                  <stop offset="0%" stopColor="#43b9b1" />
                  <stop offset="100%" stopColor="#8d80ee" />
                </linearGradient>
              </defs>
              <path className="pulse-wave pulse-wave-one" d="M0 82 C55 10 105 10 160 82 S265 154 320 82 S425 10 520 82" />
              <path className="pulse-wave pulse-wave-two" d="M0 82 C55 145 105 145 160 82 S265 10 320 82 S425 145 520 82" />
              <path className="pulse-wave pulse-wave-base" d="M0 82 H520" />
            </svg>
          </div>
          <div className="progress-pulse-footer">
            <div><strong>{completion}%</strong><span>Completion rate</span></div>
            <div><strong>{dueTodayCount}</strong><span>Due today</span></div>
            <div><strong>{upcomingTaskCount}</strong><span>Upcoming</span></div>
          </div>
          <div className="progress-pulse-track"><span style={{ width: `${completion}%` }} /></div>
          <p className="progress-pulse-note">This reflects your current tasks, not a historical trend.</p>
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
    <div className={`app-shell ${darkMode ? 'dark' : ''} accent-${accentColor} ${ambientMotion ? `ambient-${animationIntensity}` : 'ambient-off'}`}>
      <aside className="sidebar">
        <button className="brand brand-button" onClick={() => {
          setActivePage('Overview')
          setSelectedWorkspaceId(null)
        }}>
          <span className="brand-mark"><span>✦</span></span>
          <span className="brand-copy">
            <span className="brand-name">KARYA</span>
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
              <button
                type="button"
                className="notification-button"
                onClick={() => {
                  setShowNotifications(value => !value)
                  setShowWorkspaceMenu(false)
                  setShowProfileMenu(false)
                }}
                aria-label="Toggle notifications"
                aria-expanded={showNotifications}
              >
                ♧
                {notifications.some(item => !item.read) && (
                  <span className="notification-count">
                    {notifications.filter(item => !item.read).length > 99
                      ? '99+'
                      : notifications.filter(item => !item.read).length}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="notification-popover">
                  <div className="notification-heading">
                    <div>
                      <strong>Notifications</strong>
                      <small>
                        {notifications.filter(item => !item.read).length} unread
                      </small>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowNotifications(false)}
                      aria-label="Close notifications"
                    >
                      ×
                    </button>
                  </div>

                  {notifications.length ? (
                    <>
                      {notifications.slice(0, 5).map(item => (
                        <button
                          type="button"
                          className={`notification-entry ${item.read ? '' : 'notification-entry-unread'}`}
                          key={item.id}
                          onClick={() => {
                            setNotifications(current => current.map(notification =>
                              notification.id === item.id
                                ? { ...notification, read: true }
                                : notification
                            ))
                            setShowNotifications(false)
                            setTaskFilter('All')
                            setActivePage(item.taskId !== undefined ? 'My Tasks' : 'Notification Center')
                          }}
                        >
                          <span className="notification-entry-icon">
                            {item.kind === 'reminder' ? '◷' : '✦'}
                          </span>
                          <span className="notification-entry-content">
                            <strong>{item.title}</strong>
                            <span>{item.detail}</span>
                            <small>{new Date(item.createdAt).toLocaleString()}</small>
                          </span>
                          {!item.read && <span className="notification-unread-dot" />}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="notification-view-all"
                        onClick={() => {
                          setShowNotifications(false)
                          setActivePage('Notification Center')
                        }}
                      >
                        View all notifications →
                      </button>
                    </>
                  ) : (
                    <div className="empty-state">You're all caught up.</div>
                  )}
                </div>
              )}
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
          <footer className="footer"><span>© 2026 KARYA</span><span>Built for better teamwork <span className="footer-heart">♥</span></span></footer>
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
          <div className="modal-fields">
            <label>Due date<input type="date" required value={taskDate} onChange={event => setTaskDate(event.target.value)} /></label>
            <label>Due time<input type="time" required={taskReminder} value={taskTime} onChange={event => setTaskTime(event.target.value)} /></label>
            <label>Priority<select value={taskPriority} onChange={event => setTaskPriority(event.target.value as Task['priority'])}><option>Low</option><option>Medium</option><option>High</option></select></label>
          </div>
          <div className="reminder-settings">
            <label className="reminder-toggle">
              <input type="checkbox" checked={taskReminder} onChange={event => setTaskReminder(event.target.checked)} />
              Enable task reminders
            </label>
            {taskReminder && <>
              <p className="reminder-hint">Choose one or more times before the task is due.</p>
              <div className="reminder-options">
                {[
                  { value: 10, label: '10 minutes' },
                  { value: 30, label: '30 minutes' },
                  { value: 60, label: '1 hour' },
                  { value: 120, label: '2 hours' },
                  { value: 360, label: '6 hours' },
                  { value: 720, label: '12 hours' },
                  { value: 1440, label: '1 day' },
                  { value: 2880, label: '2 days' },
                  { value: 4320, label: '3 days' },
                ].map(option => (
                  <label className="reminder-option" key={option.value}>
                    <input
                      type="checkbox"
                      checked={taskReminderMinutes.includes(option.value)}
                      onChange={event => setTaskReminderMinutes(current =>
                        event.target.checked
                          ? [...new Set([...current, option.value])].sort((a, b) => a - b)
                          : current.filter(value => value !== option.value)
                      )}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              <div className="custom-reminder">
                <label>Custom timing (minutes before)</label>
                <div className="custom-reminder-controls">
                  <input
                    type="number"
                    min="1"
                    max="43200"
                    value={customReminderMinutes}
                    onChange={event => setCustomReminderMinutes(event.target.value)}
                    placeholder="Enter minutes"
                  />
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      const value = Number(customReminderMinutes)
                      if (Number.isInteger(value) && value >= 1 && value <= 43200) {
                        setTaskReminderMinutes(current => [...new Set([...current, value])].sort((a, b) => a - b))
                      } else {
                        setFormFeedback({ type: 'error', text: 'Enter custom minutes between 1 and 43200.' })
                      }
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
              <p className="reminder-selected">
                Selected: {taskReminderMinutes.length
                  ? taskReminderMinutes.map(value => value < 60 ? `${value}m` : value < 1440 ? `${value / 60}h` : `${value / 1440}d`).join(', ')
                  : 'No timings selected'}
              </p>
            </>}
          </div>
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

declare global {
  interface Window {
    togetherOS?: {
      onAuthCallback: (callback: (url: string) => void) => () => void
      updater?: {
        checkForUpdates: () => Promise<{ok:boolean; message?:string}>
        downloadUpdate: () => Promise<{ok:boolean; message?:string}>
        installUpdate: () => Promise<{ok:boolean; message?:string}>
        onStatus: (callback: (status: UpdaterStatus) => void) => () => void
      }
    }
  }
}

type AuthMode = 'login' | 'signup' | 'forgot'

function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const clearMessages = () => {
    setMessage('')
    setErrorMessage('')
  }

  const authRedirectUrl = () =>
    window.togetherOS ? 'togetheros://auth/callback' : window.location.origin

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    clearMessages()

    try {
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: authRedirectUrl() }
        )
        if (error) throw error
        setMessage('If an account exists for this email, a password reset link will be sent.')
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: authRedirectUrl(),
            data: { display_name: name.trim() },
          },
        })
        if (error) throw error
        setMessage(
          !data.session
            ? 'Account created. Please check your email to confirm your account.'
            : 'Account created successfully.'
        )
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

  const handleResend = async () => {
    clearMessages()
    if (!email.trim()) {
      setErrorMessage('Enter your email address first.')
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: authRedirectUrl() },
      })
      if (error) throw error
      setMessage('If your account needs confirmation, a new confirmation email has been requested.')
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not resend confirmation email.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand-mark">K</span>
          <span>KARYA</span>
        </div>

        <div className="auth-heading">
          <span className="auth-eyebrow">YOUR TEAM'S SHARED SPACE</span>
          <h1>
            {mode === 'login' ? 'Welcome back.' :
             mode === 'signup' ? 'Bring your team together.' : 'Reset your password.'}
          </h1>
          <p>
            {mode === 'login' ? 'Sign in to continue where your team left off.' :
             mode === 'signup' ? 'Create your account and start organising work together.' :
             'Enter your account email and we will send a reset link.'}
          </p>
        </div>

        {mode !== 'forgot' && (
          <div className="auth-tabs">
            <button type="button" className={mode === 'login' ? 'selected' : ''}
              onClick={() => { setMode('login'); clearMessages() }}>
              Log in
            </button>
            <button type="button" className={mode === 'signup' ? 'selected' : ''}
              onClick={() => { setMode('signup'); clearMessages() }}>
              Create account
            </button>
          </div>
        )}

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

          {mode !== 'forgot' && (
            <label>
              Password
              <input required type="password" minLength={8}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password} onChange={event => setPassword(event.target.value)}
                placeholder="At least 8 characters" />
            </label>
          )}

          {errorMessage && <p className="auth-message auth-error" role="alert">{errorMessage}</p>}
          {message && <p className="auth-message auth-success" role="status">{message}</p>}

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? 'Please wait...' :
             mode === 'login' ? 'Sign in to KARYA' :
             mode === 'signup' ? 'Create your account' : 'Send reset link'}
            {!busy && <span>→</span>}
          </button>
        </form>

        {mode === 'login' && (
          <div className="auth-extra-actions">
            <button type="button" className="auth-link"
              onClick={() => { setMode('forgot'); clearMessages() }}>
              Forgot password?
            </button>
            <button type="button" className="auth-link" disabled={busy}
              onClick={handleResend}>
              Resend confirmation email
            </button>
          </div>
        )}

        {mode === 'forgot' && (
          <button type="button" className="auth-link auth-back-link"
            onClick={() => { setMode('login'); clearMessages() }}>
            ← Back to login
          </button>
        )}

        <p className="auth-footer">
          By continuing, you agree to use KARYA responsibly with your team.
        </p>
      </section>
      <div className="auth-decoration auth-decoration-one" />
      <div className="auth-decoration auth-decoration-two" />
    </main>
  )
}

function ResetPasswordScreen({ onDone }: { onDone: () => void }) {
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
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setMessage('Password updated successfully. You can now log in with your new password.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not update password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand-mark">K</span>
          <span>KARYA</span>
        </div>
        <div className="auth-heading">
          <span className="auth-eyebrow">ACCOUNT SECURITY</span>
          <h1>Choose a new password.</h1>
          <p>Enter a new password with at least 8 characters.</p>
        </div>
        {message ? (
          <>
            <p className="auth-message auth-success" role="status">{message}</p>
            <button className="auth-submit" type="button" onClick={onDone}>
              Continue to login <span>→</span>
            </button>
          </>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              New password
              <input required type="password" minLength={8}
                autoComplete="new-password" value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="At least 8 characters" />
            </label>
            {errorMessage && <p className="auth-message auth-error" role="alert">{errorMessage}</p>}
            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? 'Updating...' : 'Update password'}
              {!busy && <span>→</span>}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  useEffect(() => {
    const unsubscribe = window.togetherOS?.onAuthCallback((callbackUrl) => {
      try {
        const callback = new URL(callbackUrl)
        const code = callback.searchParams.get('code')
        const callbackError = callback.searchParams.get('error_description') || callback.searchParams.get('error')

        if (callbackError) {
          window.alert(`Email confirmation failed: ${callbackError}`)
          return
        }
        if (code) {
          void supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
            if (error) window.alert(`Could not complete email confirmation: ${error.message}`)
          })
        }
      } catch (error) {
        console.error('Invalid TogetherOS authentication callback:', error)
      }
    })

    return () => unsubscribe?.()
  }, [])

  useEffect(() => {
    let mounted = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!mounted) return
        if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
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

  if (passwordRecovery && session) {
    return (
      <ResetPasswordScreen onDone={async () => {
        setPasswordRecovery(false)
        await supabase.auth.signOut()
      }} />
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
