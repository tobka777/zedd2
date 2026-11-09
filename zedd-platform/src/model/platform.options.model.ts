export interface PlatformOptions {
  headless?: boolean
  /**
   * Persistent Edge profile directory. Edge signs in with the Microsoft work account of the device
   * (SSO), and the profile keeps logins between runs, so the 2FA prompt doesn't come every time.
   * Without it, every run starts with a fresh profile.
   */
  userDataDir?: string
  /**
   * Size of the browser window, usually the available screen size. Passed in, as the integrations
   * may run in a process without access to the screen.
   */
  windowSize?: { width: number; height: number }
}
