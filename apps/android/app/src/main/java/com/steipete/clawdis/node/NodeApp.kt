package com.steipete.clawdis.node

import android.app.Application

class NodeApp : Application() {
  val runtime: NodeRuntime by lazy { NodeRuntime(this) }
}

