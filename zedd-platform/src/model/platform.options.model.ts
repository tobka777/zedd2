export interface PlatformOptions {
  headless?: boolean
  /**
   * Persistent Edge profile directory. Edge signs in with the Microsoft work account of the device
   * (SSO), and the profile keeps logins between runs, so the 2FA prompt doesn't come every time.
   * Without it, every run starts with a fresh profile.
   */
  userDataDir?: string
}
