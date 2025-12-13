import SwiftUI

struct RootCanvas: View {
    @State private var isShowingSettings = false

    var body: some View {
        ZStack(alignment: .topTrailing) {
            ScreenTab()

            Button {
                self.isShowingSettings = true
            } label: {
                Image(systemName: "gearshape.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.primary)
                    .padding(10)
                    .background(.thinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.top, 10)
            .padding(.trailing, 10)
            .accessibilityLabel("Settings")
        }
        .sheet(isPresented: self.$isShowingSettings) {
            SettingsTab()
        }
    }
}
