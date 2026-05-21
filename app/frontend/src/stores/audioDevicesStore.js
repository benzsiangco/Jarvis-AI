/**
 * audioDevicesStore — selected mic + speaker devices.
 *
 * Persisted in localStorage so the user's pick survives reloads. Components
 * read these IDs and feed them to `getUserMedia({ deviceId })` for input
 * and `audio.setSinkId()` for output.
 *
 * `inputDeviceId` / `outputDeviceId` of `''` means "browser default".
 */
import { create } from 'zustand';

const KEY_IN  = 'jarvis:audio:inputDeviceId';
const KEY_OUT = 'jarvis:audio:outputDeviceId';

const useAudioDevicesStore = create((set) => ({
  inputDeviceId:  load(KEY_IN),
  outputDeviceId: load(KEY_OUT),

  setInputDevice: (id) => {
    save(KEY_IN, id);
    set({ inputDeviceId: id || '' });
  },
  setOutputDevice: (id) => {
    save(KEY_OUT, id);
    set({ outputDeviceId: id || '' });
  },
}));

function load(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } }
function save(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} }

export default useAudioDevicesStore;
