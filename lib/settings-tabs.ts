export const SETTINGS_TABS = ["profile", "employment", "security"] as const

export type SettingsTab = (typeof SETTINGS_TABS)[number]

// `?tab=security` lets the profile menu drop someone straight onto the
// password form. Anything unrecognised falls back to Profile rather than
// rendering a Tabs root with no matching panel.
export function settingsTabFrom(value: string | string[] | undefined) {
  return SETTINGS_TABS.includes(value as SettingsTab)
    ? (value as SettingsTab)
    : "profile"
}
