import { createFileRoute } from '@tanstack/react-router'
import { orpc, orpcClient } from '../lib/orpc'
import { useEffect, useState } from 'react'
import { Folder, Save, RefreshCw, AlertCircle, HelpCircle, HardDrive, Smartphone, FolderOpen, ChevronRight, ArrowUp, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const Route = createFileRoute('/settings')({
  component: SettingsComponent,
})

function SettingsComponent() {
  const queryClient = useQueryClient()
  const [vaultPath, setVaultPath] = useState('')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Picker state
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [pickerPath, setPickerPath] = useState('')
  const [pickerDirs, setPickerDirs] = useState<string[]>([])
  const [pickerParent, setPickerParent] = useState<string | null>(null)
  const [pickerShortcuts, setPickerShortcuts] = useState<Array<{ name: string; path: string }>>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerError, setPickerError] = useState<string | null>(null)

  const loadDirectory = async (targetPath: string) => {
    setPickerLoading(true)
    setPickerError(null)
    try {
      const res = await orpcClient.browseDirectories({ path: targetPath })
      setPickerPath(res.currentPath)
      setPickerParent(res.parentPath)
      setPickerDirs(res.directories)
      setPickerShortcuts(res.shortcuts || [])
      if (res.error) {
        setPickerError(res.error)
      }
    } catch (err: any) {
      setPickerError(err.message || 'Failed to load directory')
    } finally {
      setPickerLoading(false)
    }
  }

  const handleBrowseClick = () => {
    setIsPickerOpen(true)
    loadDirectory(vaultPath)
  }

  const handleFolderClick = (folderName: string) => {
    const nextPath = pickerPath.endsWith('/') 
      ? `${pickerPath}${folderName}`
      : `${pickerPath}/${folderName}`
    loadDirectory(nextPath)
  }

  const handleGoUp = () => {
    if (pickerParent) {
      loadDirectory(pickerParent)
    }
  }

  const handleSelectPath = () => {
    setVaultPath(pickerPath)
    setIsPickerOpen(false)
  }

  // Query current settings
  const { data: settingsData, isLoading: isSettingsLoading } = useQuery(
    orpc.getSettings.queryOptions()
  )

  // Query health status to check vault status
  const { data: healthData, refetch: refetchHealth } = useQuery(
    orpc.health.queryOptions()
  )

  useEffect(() => {
    if (settingsData?.vaultPath) {
      setVaultPath(settingsData.vaultPath)
    }
  }, [settingsData])

  const updateSettingsMutation = useMutation(
    orpc.updateSettings.mutationOptions({
      onSuccess: (res) => {
        if (res.success) {
          setFeedback({ type: 'success', message: 'Vault path updated successfully. Re-indexing completed!' })
          queryClient.invalidateQueries()
          refetchHealth()
        } else {
          setFeedback({ type: 'error', message: res.error || 'Failed to update vault path' })
        }
      },
      onError: (err) => {
        setFeedback({ type: 'error', message: err.message || 'An error occurred while saving' })
      }
    })
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFeedback(null)
    updateSettingsMutation.mutate({ vaultPath })
  }

  const isSaving = updateSettingsMutation.isPending

  const vaultStatus = healthData?.services?.vault || 'unknown'

  return (
    <div className="min-h-screen bg-[var(--foam)] p-6 lg:p-10">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col gap-2">
          <h1 className="display-title text-4xl font-bold text-[var(--sea-ink)]">System Settings</h1>
          <p className="text-[var(--sea-ink-soft)] font-medium">Configure your Obsidian vault location and sync settings.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main settings form */}
          <div className="lg:col-span-2 space-y-6">
            <div className="island-shell p-8 rounded-[2rem] border border-[var(--line)] shadow-xl relative overflow-hidden">
              <h2 className="text-xl font-bold text-[var(--sea-ink)] mb-6 flex items-center gap-3">
                <Folder className="text-[var(--lagoon-deep)]" size={22} />
                Obsidian Vault Path
              </h2>

              {isSettingsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="animate-spin text-[var(--sea-ink-soft)]" size={28} />
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label htmlFor="vault-path" className="block text-xs font-bold uppercase tracking-widest text-[var(--sea-ink-soft)] ml-1">
                      Local Path
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="vault-path"
                        type="text"
                        value={vaultPath}
                        onChange={(e) => setVaultPath(e.target.value)}
                        className="flex-grow px-4 py-4 rounded-xl bg-[var(--surface-strong)] border border-[var(--line)] text-[var(--sea-ink)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--lagoon)] transition-all"
                        placeholder="/absolute/path/to/your/ObsidianVault"
                        required
                      />
                      <button
                        type="button"
                        onClick={handleBrowseClick}
                        className="px-5 rounded-xl bg-[var(--surface-strong)] hover:bg-[var(--foam)] border border-[var(--line)] text-[var(--sea-ink)] hover:text-[var(--lagoon-deep)] font-bold flex items-center justify-center gap-2 transition-all cursor-pointer select-none shrink-0"
                        title="Browse directories"
                      >
                        <FolderOpen size={18} />
                        <span className="hidden sm:inline">Browse</span>
                      </button>
                    </div>
                    <p className="text-xs text-[var(--sea-ink-soft)] italic ml-1">
                      Note: Specify the absolute path to your Obsidian vault directory. If you are running the application in a virtualized or containerized environment, ensure the path reflects the environment's mount structure.
                    </p>
                  </div>

                  {feedback && (
                    <div className={`p-4 rounded-xl flex items-start gap-3 text-sm font-medium ${
                      feedback.type === 'success' 
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400' 
                        : 'bg-red-50 text-red-800 border border-red-100 dark:bg-red-950/20 dark:text-red-400'
                    }`}>
                      <AlertCircle className="shrink-0 mt-0.5" size={18} />
                      <div>{feedback.message}</div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSaving}
                    className="py-3.5 px-6 rounded-xl bg-sea-ink text-bg-base font-bold flex items-center justify-center gap-2 hover:bg-sea-ink-soft hover:text-bg-base transition-all disabled:opacity-50 shadow-md active:scale-[0.98]"
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw className="animate-spin" size={18} />
                        Syncing & Re-indexing...
                      </>
                    ) : (
                      <>
                        <Save size={18} />
                        Save & Reindex Vault
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>

            {/* Sync configuration guide */}
            <div className="island-shell p-8 rounded-[2rem] border border-[var(--line)] shadow-xl space-y-6">
              <h2 className="text-xl font-bold text-[var(--sea-ink)] flex items-center gap-3">
                <Smartphone className="text-[var(--lagoon-deep)]" size={22} />
                Mobile Synchronization Guide
              </h2>
              
              <div className="space-y-4 text-sm text-[var(--sea-ink-soft)] leading-relaxed font-medium">
                <p>
                  To sync notes created on your mobile device (Android or iOS) with this local LLM Wiki companion engine, you can use any directory-level synchronization tool:
                </p>
                <ul className="list-disc list-inside space-y-2.5">
                  <li>
                    <strong>Official Obsidian Sync:</strong> Secure, end-to-end encrypted native synchronization managed by Obsidian.
                  </li>
                  <li>
                    <strong>Local Directory Mirroring:</strong> Use tools like <strong>Syncthing</strong>, <strong>iCloud</strong>, or <strong>Git</strong> to replicate your vault directory directly.
                  </li>
                  <li>
                    <strong>Cloud Integration Plugins:</strong> Configure community plugins (such as *Remotely Save* or *Obsidian Git*) to sync via third-party providers.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Status sidebar */}
          <div className="space-y-6">
            
            {/* Vault Status Card */}
            <div className="island-shell p-6 rounded-[2rem] border border-[var(--line)] shadow-xl space-y-4">
              <h3 className="text-md font-bold text-[var(--sea-ink)] flex items-center gap-2">
                <HardDrive size={18} className="text-[var(--sea-ink-soft)]" />
                Connection Status
              </h3>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-[var(--line)]">
                  <span className="text-xs font-bold text-[var(--sea-ink-soft)] uppercase tracking-wider">Vault Accessibility</span>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    vaultStatus === 'ok' 
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400' 
                      : 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400'
                  }`}>
                    {vaultStatus === 'ok' ? 'Connected' : 'Offline / Invalid'}
                  </span>
                </div>
                
                <div className="flex justify-between items-center py-2 border-b border-[var(--line)]">
                  <span className="text-xs font-bold text-[var(--sea-ink-soft)] uppercase tracking-wider">File Watcher Mode</span>
                  <span className="text-xs font-bold text-[var(--sea-ink)] bg-foam px-2.5 py-1 rounded-full border border-[var(--line)]">
                    {vaultPath.includes('/mnt/') ? 'Optimized Polling Sync' : 'Direct Event Monitor'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-2">
                  <span className="text-xs font-bold text-[var(--sea-ink-soft)] uppercase tracking-wider">System Health</span>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    healthData?.status === 'ok'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
                      : 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400'
                  }`}>
                    {healthData?.status === 'ok' ? 'Healthy' : 'Error'}
                  </span>
                </div>
              </div>
            </div>

            {/* Help / Tips Box */}
            <div className="p-6 rounded-[2rem] bg-[var(--surface-strong)] border border-[var(--line)] space-y-4">
              <h3 className="text-md font-bold text-[var(--sea-ink)] flex items-center gap-2">
                <HelpCircle size={18} className="text-[var(--sea-ink-soft)]" />
                Useful Tips
              </h3>
              <ul className="text-xs text-[var(--sea-ink-soft)] space-y-2 list-disc list-inside font-medium leading-relaxed">
                <li>
                  Saving a new path triggers an automatic vault synchronization check to align database entries with your local markdown files.
                </li>
                <li>
                  Your vault maintains a single, unified folder structure. Notes are saved directly where they belong, keeping your graph clean and preventing duplicate files.
                </li>
                <li>
                  Refactoring notes updates their content in-place while preserving all metadata, inbound links, and outbound links intact.
                </li>
              </ul>
            </div>

          </div>

        </div>

      </div>

      {isPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--surface-strong)] border border-[var(--line)] w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden transition-all scale-in">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-[var(--line)] flex items-center justify-between shrink-0 bg-surface">
              <div className="flex items-center gap-3">
                <FolderOpen className="text-[var(--lagoon-deep)]" size={24} />
                <h3 className="text-xl font-bold text-[var(--sea-ink)]">Select Vault Directory</h3>
              </div>
              <button 
                type="button"
                onClick={() => setIsPickerOpen(false)}
                className="p-2 rounded-lg text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)] hover:bg-[var(--foam)] transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Path Navigation bar */}
            <div className="px-6 py-4 border-b border-[var(--line)] bg-[var(--foam)]/30 flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={handleGoUp}
                disabled={!pickerParent || pickerLoading}
                className="p-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] text-[var(--sea-ink)] hover:text-[var(--lagoon-deep)] hover:bg-[var(--foam)] transition-all disabled:opacity-40 disabled:hover:text-[var(--sea-ink)] disabled:hover:bg-[var(--surface-strong)] cursor-pointer disabled:cursor-not-allowed shrink-0"
                title="Go up one level"
              >
                <ArrowUp size={16} />
              </button>
              
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={pickerPath}
                  onChange={(e) => setPickerPath(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      loadDirectory(pickerPath);
                    }
                  }}
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--surface-strong)] border border-[var(--line)] text-[var(--sea-ink)] font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[var(--lagoon)] transition-all"
                  title="Current location path (press Enter to go)"
                />
              </div>
              
              <button
                type="button"
                onClick={() => loadDirectory(pickerPath)}
                disabled={pickerLoading}
                className="px-4 py-2.5 rounded-xl bg-sea-ink text-bg-base hover:bg-sea-ink-soft font-bold text-xs transition-all cursor-pointer shrink-0"
              >
                Go
              </button>
            </div>

            {/* Quick Access Shortcuts */}
            {pickerShortcuts.length > 0 && (
              <div className="px-6 py-3 border-b border-[var(--line)] bg-[var(--foam)]/10 flex flex-wrap items-center gap-2 shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--sea-ink-soft)] mr-1">
                  Quick Access:
                </span>
                {pickerShortcuts.map((shortcut) => (
                  <button
                    type="button"
                    key={shortcut.name}
                    onClick={() => loadDirectory(shortcut.path)}
                    className="px-3 py-1 rounded-lg text-xs font-bold bg-[var(--surface-strong)] hover:bg-[var(--foam)] border border-[var(--line)] text-[var(--sea-ink)] hover:text-[var(--lagoon-deep)] transition-all cursor-pointer select-none"
                  >
                    {shortcut.name}
                  </button>
                ))}
              </div>
            )}

            {/* Folder list container */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-2">
              {pickerError && (
                <div className="p-4 rounded-xl bg-red-50 text-red-800 border border-red-100 flex items-start gap-3 text-sm font-medium">
                  <AlertCircle className="shrink-0 mt-0.5" size={18} />
                  <div>
                    <div className="font-bold">Error loading folder</div>
                    <div className="text-xs opacity-90 mt-0.5">{pickerError}</div>
                  </div>
                </div>
              )}

              {pickerLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <RefreshCw className="animate-spin text-[var(--lagoon-deep)]" size={32} />
                  <span className="text-xs text-[var(--sea-ink-soft)] font-medium">Reading folder contents...</span>
                </div>
              ) : pickerDirs.length === 0 ? (
                <div className="text-center py-16 text-sm text-[var(--sea-ink-soft)] italic border border-dashed border-[var(--line)] rounded-2xl bg-[var(--foam)]/10">
                  No subdirectories found in this folder.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {pickerDirs.map((dirName) => (
                    <button
                      type="button"
                      key={dirName}
                      onClick={() => handleFolderClick(dirName)}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--surface-strong)] border border-[var(--line)] hover:border-[var(--lagoon)] hover:bg-[var(--foam)]/40 transition-all text-left group cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Folder className="text-[var(--sea-ink-soft)] group-hover:text-[var(--lagoon-deep)] shrink-0 transition-colors" size={18} />
                        <span className="font-semibold text-sm text-[var(--sea-ink)] truncate">{dirName}</span>
                      </div>
                      <ChevronRight className="text-[var(--sea-ink-soft)] opacity-0 group-hover:opacity-100 group-hover:text-[var(--lagoon-deep)] transition-all shrink-0" size={16} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-[var(--line)] flex items-center justify-end gap-3 shrink-0 bg-surface">
              <button
                type="button"
                onClick={() => setIsPickerOpen(false)}
                className="py-3 px-5 rounded-xl border border-[var(--line)] text-[var(--sea-ink)] hover:bg-[var(--foam)] font-bold text-sm transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSelectPath}
                disabled={pickerLoading}
                className="py-3 px-6 rounded-xl bg-sea-ink text-bg-base hover:bg-sea-ink-soft font-bold text-sm flex items-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FolderOpen size={16} />
                Select Current Folder
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
