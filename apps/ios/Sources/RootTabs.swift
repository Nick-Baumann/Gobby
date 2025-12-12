import SwiftUI

struct RootTabs: View {
    var body: some View {
        TabView {
            ScreenTab()
                .tabItem { Label("Screen", systemImage: "rectangle.and.hand.point.up.left") }

            VoiceTab()
                .tabItem { Label("Voice", systemImage: "mic") }

            SettingsTab()
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
    }
}
