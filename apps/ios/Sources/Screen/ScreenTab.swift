import ClawdisNodeKit
import SwiftUI

struct ScreenTab: View {
    @EnvironmentObject private var appModel: NodeAppModel

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScreenWebView(controller: self.appModel.screen)
                    .overlay(alignment: .top) {
                        if let errorText = self.appModel.screen.errorText {
                            Text(errorText)
                                .font(.footnote)
                                .padding(10)
                                .background(.thinMaterial)
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                .padding()
                        }
                    }

                Divider()

                VStack(spacing: 10) {
                    Picker(
                        "Mode",
                        selection: Binding(
                            get: { self.appModel.screen.mode },
                            set: { self.appModel.screen.setMode($0) }))
                    {
                        Text("Web").tag(ClawdisScreenMode.web)
                        Text("Canvas").tag(ClawdisScreenMode.canvas)
                    }
                    .pickerStyle(.segmented)

                    HStack(spacing: 10) {
                        TextField(
                            "URL",
                            text: Binding(
                                get: { self.appModel.screen.urlString },
                                set: { self.appModel.screen.urlString = $0 }))
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.URL)
                            .textFieldStyle(.roundedBorder)
                        Button("Go") { self.navigate() }
                            .buttonStyle(.borderedProminent)
                    }

                    if self.appModel.isBackgrounded {
                        Text("Screen commands unavailable while backgrounded.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding()
            }
            .navigationTitle("Screen")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func navigate() {
        if self.appModel.isBackgrounded {
            self.appModel.screen.errorText = ClawdisNodeError(
                code: .backgroundUnavailable,
                message: "NODE_BACKGROUND_UNAVAILABLE: screen commands require foreground").message
            return
        }
        self.appModel.screen.errorText = nil
        self.appModel.screen.reload()
    }
}
