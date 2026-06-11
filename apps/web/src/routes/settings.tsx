import { createFileRoute } from '@tanstack/react-router'
import { orpc } from '../lib/orpc'
import { useEffect, useState } from 'react'
import { Folder, Save, RefreshCw, AlertCircle, HelpCircle, HardDrive, Smartphone } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const Route = createFileRoute('/settings')({
  component: SettingsComponent,
})

function SettingsComponent() {
  const queryClient = useQueryClient()
  const [vaultPath, setVaultPath] = useState('')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

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
                      Local Absolute Path (WSL mount format)
                    </label>
                    <div className="relative">
                      <input
                        id="vault-path"
                        type="text"
                        value={vaultPath}
                        onChange={(e) => setVaultPath(e.target.value)}
                        className="w-full px-4 py-4 rounded-xl bg-[var(--surface-strong)] border border-[var(--line)] text-[var(--sea-ink)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--lagoon)] transition-all"
                        placeholder="/mnt/d/OneDrive/Documents/Obsidian Vault"
                        required
                      />
                    </div>
                    <p className="text-xs text-[var(--sea-ink-soft)] italic ml-1">
                      Note: Since you are using WSL, Windows paths must be entered as mounts, e.g. <code className="bg-[var(--surface-strong)] px-1 py-0.5 rounded text-[var(--lagoon-deep)]">D:\Vault</code> becomes <code className="bg-[var(--surface-strong)] px-1 py-0.5 rounded text-[var(--lagoon-deep)]">/mnt/d/Vault</code>.
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
                  To sync notes created on your mobile device (Android or iOS) with this local LLM Wiki companion engine:
                </p>
                <ol className="list-decimal list-inside space-y-2.5">
                  <li>
                    Install **Obsidian** on your mobile device.
                  </li>
                  <li>
                    Install the **Remotely Save** community plugin inside Obsidian on both your mobile device and your laptop.
                  </li>
                  <li>
                    Configure **Remotely Save** on both devices to point to your **OneDrive** folder.
                  </li>
                  <li>
                    When you edit notes on the go, they sync to OneDrive. The local OneDrive agent writes them to your laptop drive, where this watcher detects and imports them dynamically.
                  </li>
                </ol>
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
                    {vaultPath.includes('/mnt/') ? 'Polling (1s)' : 'Native (inotify)'}
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
                  Upon saving a new path, the backend runs a full synchronization check. This matches database note entries with markdown files, adding new files and pruning obsolete database entries.
                </li>
                <li>
                  The watcher automatically partitions files: users edit notes inside <code className="bg-[var(--foam)] px-1 py-0.5 rounded text-[var(--lagoon-deep)]">human/</code>, while AI generated notes are stored inside <code className="bg-[var(--foam)] px-1 py-0.5 rounded text-[var(--lagoon-deep)]">ai-generated/</code>.
                </li>
                <li>
                  If you open this vault root path in Obsidian on Windows, you will see both directories inside the file sidebar.
                </li>
              </ul>
            </div>

          </div>

        </div>

      </div>
    </div>
  )
}
