import { supabase } from './supabase'

export type LocalWorkspace = {
  id: number
  name: string
  category: string
  members: number
  color: 'purple' | 'blue' | 'orange'
  cloudId?: string
}

export type LocalTask = {
  id: number
  title: string
  project: string
  date: string
  completed: boolean
  priority: 'Low' | 'Medium' | 'High'
  assignee?: string
  cloudId?: string
}

type CloudWorkspace = {
  id: string
  name: string
  category: string
  color: 'purple' | 'blue' | 'orange'
  owner_id: string
}

type CloudTask = {
  id: string
  workspace_id: string
  created_by: string
  title: string
  due_date: string | null
  completed: boolean
  priority: 'Low' | 'Medium' | 'High'
  assignee_label: string | null
}

function sameTask(a: LocalTask, b: CloudTask, workspaceId: string, userId: string) {
  return (
    b.workspace_id === workspaceId &&
    b.created_by === userId &&
    b.title === a.title &&
    (b.due_date ?? '') === a.date &&
    b.completed === a.completed &&
    b.priority === a.priority &&
    (b.assignee_label ?? '') === (a.assignee ?? '')
  )
}

export async function loadAndMigrateCloudData(
  userId: string,
  localWorkspaces: LocalWorkspace[],
  localTasks: LocalTask[],
) {
  // Verify the active browser session against Supabase Auth.
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

  if (sessionError) throw sessionError

  const sessionUserId = sessionData.session?.user.id

  console.info('TogetherOS auth diagnostic:', {
    sessionExists: Boolean(sessionData.session),
    sessionUserId: sessionUserId ?? null,
    workspaceUserId: userId,
    userIdsMatch: sessionUserId === userId,
  })

  if (!sessionUserId || sessionUserId !== userId) {
    throw new Error(
      'Authentication mismatch: active Supabase session does not match the workspace user.',
    )
  }

  const { data: verifiedUser, error: verifiedUserError } = await supabase.auth.getUser()

  if (verifiedUserError) throw verifiedUserError

  console.info('TogetherOS verified auth user:', {
    verifiedUserId: verifiedUser.user.id,
    workspaceUserId: userId,
    userIdsMatch: verifiedUser.user.id === userId,
  })

  if (verifiedUser.user.id !== userId) {
    throw new Error('Supabase verified user does not match the workspace user.')
  }

  // Inspect PostgreSQL's actual authentication context.
  const { data: authDiagnostic, error: authDiagnosticError } =
    await supabase.rpc('debug_workspace_auth')

  console.info('TogetherOS database auth diagnostic:', {
    data: authDiagnostic,
    error: authDiagnosticError,
  })

  const { data: initialRows, error: initialError } = await supabase
    .from('workspaces')
    .select('id, name, category, color, owner_id')

  if (initialError) throw initialError

  let cloudWorkspaces = (initialRows ?? []) as CloudWorkspace[]

  // Preserve local workspaces by matching their names before creating new ones.
  for (const local of localWorkspaces) {
    const existing = cloudWorkspaces.find(
      item => item.name.trim().toLowerCase() === local.name.trim().toLowerCase(),
    )

    if (existing) continue

    const { data, error } = await supabase
      .from('workspaces')
      .insert({
        name: local.name,
        category: local.category || 'General',
        color: local.color,
        owner_id: userId,
      })
      .select('id, name, category, color, owner_id')
      .single()

    if (error) throw error
    cloudWorkspaces = [...cloudWorkspaces, data as CloudWorkspace]
  }

  const workspaceIds = cloudWorkspaces.map(item => item.id)
  let cloudTasks: CloudTask[] = []

  if (workspaceIds.length > 0) {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, workspace_id, created_by, title, due_date, completed, priority, assignee_label')
      .in('workspace_id', workspaceIds)

    if (error) throw error
    cloudTasks = (data ?? []) as CloudTask[]
  }

  // Migrate local tasks only when their workspace exists in the cloud.
  for (const local of localTasks) {
    const workspace = cloudWorkspaces.find(
      item => item.name.trim().toLowerCase() === local.project.trim().toLowerCase(),
    )

    if (!workspace) continue

    const duplicate = cloudTasks.some(
      item => sameTask(local, item, workspace.id, userId),
    )

    if (duplicate) continue

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        workspace_id: workspace.id,
        created_by: userId,
        title: local.title,
        due_date: local.date || null,
        completed: local.completed,
        priority: local.priority,
        assignee_label: local.assignee?.trim() || null,
      })
      .select('id, workspace_id, created_by, title, due_date, completed, priority, assignee_label')
      .single()

    if (error) throw error
    cloudTasks = [...cloudTasks, data as CloudTask]
  }

  // Read the final cloud state after migration.
  const { data: finalWorkspaceRows, error: finalWorkspaceError } = await supabase
    .from('workspaces')
    .select('id, name, category, color, owner_id')

  if (finalWorkspaceError) throw finalWorkspaceError

  const finalWorkspaces = (finalWorkspaceRows ?? []) as CloudWorkspace[]
  const finalIds = finalWorkspaces.map(item => item.id)
  let finalTasks: CloudTask[] = []

  if (finalIds.length > 0) {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, workspace_id, created_by, title, due_date, completed, priority, assignee_label')
      .in('workspace_id', finalIds)

    if (error) throw error
    finalTasks = (data ?? []) as CloudTask[]
  }

  const mappedWorkspaces: LocalWorkspace[] = finalWorkspaces.map((row, index) => {
    const local = localWorkspaces.find(
      item => item.name.trim().toLowerCase() === row.name.trim().toLowerCase(),
    )

    return {
      id: local?.id ?? index + 1,
      cloudId: row.id,
      name: row.name,
      category: row.category,
      members: local?.members ?? 1,
      color: row.color,
    }
  })

  const mappedTasks: LocalTask[] = finalTasks.map((row, index) => {
    const workspace = finalWorkspaces.find(item => item.id === row.workspace_id)
    const local = localTasks.find(item =>
      item.project.trim().toLowerCase() === (workspace?.name ?? '').trim().toLowerCase() &&
      sameTask(item, row, row.workspace_id, userId),
    )

    return {
      id: local?.id ?? Date.now() + index,
      cloudId: row.id,
      title: row.title,
      project: workspace?.name ?? 'Workspace',
      date: row.due_date ?? '',
      completed: row.completed,
      priority: row.priority,
      assignee: row.assignee_label ?? '',
    }
  })

  return {
    workspaces: mappedWorkspaces,
    tasks: mappedTasks,
  }
}
