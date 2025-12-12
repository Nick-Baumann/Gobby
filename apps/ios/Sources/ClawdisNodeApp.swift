import SwiftUI

@main
struct ClawdisNodeApp: App {
    @StateObject private var appModel = NodeAppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootTabs()
                .environmentObject(self.appModel)
                .environmentObject(self.appModel.voiceWake)
                .onChange(of: self.scenePhase) { _, newValue in
                    self.appModel.setScenePhase(newValue)
                }
        }
    }
}
