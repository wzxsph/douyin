import { readonly, ref } from 'vue'

const STORAGE_KEY = 'caibao-showcase-sound-enabled'

function readPreference() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

const soundEnabledState = ref(readPreference())

export const showcaseSoundEnabled = readonly(soundEnabledState)

export function setShowcaseSoundEnabled(enabled: boolean) {
  soundEnabledState.value = enabled
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, String(enabled))
  } catch {
    // Storage can be unavailable in private or embedded browsing contexts.
  }
}
