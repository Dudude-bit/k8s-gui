import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useState, useCallback } from 'react';

export interface UpdateStatus {
    checking: boolean;
    available: boolean;
    downloading: boolean;
    progress: number;
    version?: string;
    notes?: string;
    error?: string;
}

export function useUpdater() {
    const [status, setStatus] = useState<UpdateStatus>({
        checking: false,
        available: false,
        downloading: false,
        progress: 0,
    });
    const [update, setUpdate] = useState<Update | null>(null);

    const checkForUpdates = useCallback(async () => {
        setStatus(prev => ({ ...prev, checking: true, error: undefined }));
        try {
            const updateResult = await check();
            if (updateResult) {
                setUpdate(updateResult);
                setStatus(prev => ({
                    ...prev,
                    checking: false,
                    available: true,
                    version: updateResult.version,
                    notes: updateResult.body ?? undefined,
                }));
                return updateResult;
            } else {
                setStatus(prev => ({ ...prev, checking: false, available: false }));
                return null;
            }
        } catch (error) {
            setStatus(prev => ({
                ...prev,
                checking: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }));
            return null;
        }
    }, []);

    const downloadAndInstall = useCallback(async () => {
        if (!update) {
            const newUpdate = await check();
            if (!newUpdate) return;
            setUpdate(newUpdate);
        }

        const currentUpdate = update ?? (await check());
        if (!currentUpdate) return;

        setStatus(prev => ({ ...prev, downloading: true, progress: 0 }));

        let downloaded = 0;
        let contentLength = 0;

        try {
            await currentUpdate.downloadAndInstall((event) => {
                switch (event.event) {
                    case 'Started':
                        contentLength = event.data.contentLength ?? 0;
                        break;
                    case 'Progress': {
                        downloaded += event.data.chunkLength;
                        const progress = contentLength > 0
                            ? Math.round((downloaded / contentLength) * 100)
                            : 0;
                        setStatus(prev => ({ ...prev, progress }));
                        break;
                    }
                    case 'Finished':
                        setStatus(prev => ({ ...prev, downloading: false, progress: 100 }));
                        break;
                }
            });

            await relaunch();
        } catch (error) {
            setStatus(prev => ({
                ...prev,
                downloading: false,
                error: error instanceof Error ? error.message : 'Installation failed',
            }));
        }
    }, [update]);

    const dismissUpdate = useCallback(() => {
        setStatus(prev => ({
            ...prev,
            available: false,
            version: undefined,
            notes: undefined,
        }));
        setUpdate(null);
    }, []);

    return { status, checkForUpdates, downloadAndInstall, dismissUpdate };
}
