import Foundation

let serviceName = "com.steipete.clawdis.xpc"
let launchdLabel = "com.steipete.clawdis"
let onboardingVersionKey = "clawdis.onboardingVersion"
let currentOnboardingVersion = 2
let pauseDefaultsKey = "clawdis.pauseEnabled"
let swabbleEnabledKey = "clawdis.swabbleEnabled"
let swabbleTriggersKey = "clawdis.swabbleTriggers"
let showDockIconKey = "clawdis.showDockIcon"
let defaultVoiceWakeTriggers = ["clawd", "claude"]
let voiceWakeMicKey = "clawdis.voiceWakeMicID"
let voiceWakeLocaleKey = "clawdis.voiceWakeLocaleID"
let voiceWakeAdditionalLocalesKey = "clawdis.voiceWakeAdditionalLocaleIDs"
let modelCatalogPathKey = "clawdis.modelCatalogPath"
let modelCatalogReloadKey = "clawdis.modelCatalogReload"
let voiceWakeSupported: Bool = ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 26
