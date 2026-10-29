package dev.swarnim.metamorph

import android.graphics.Color
import android.os.Bundle
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

// The app is always dark (--bg in styles.css), whatever the phone's theme is.
private const val APP_BACKGROUND = "#121316"

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Light status and navigation icons on a dark app, even when the phone is in light mode.
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
    )
    super.onCreate(savedInstanceState)

    // Edge-to-edge draws the web page under the status and navigation bars. The WebView does not
    // report those as CSS safe-area insets, so keep the page clear of them here instead. The keyboard
    // counts too: without it the page keeps its full height and the keyboard covers the bottom
    // sheets (exercise and gym search). Per side the largest inset wins, so the bottom is the
    // keyboard's height while it is open and the navigation bar's otherwise.
    window.decorView.setBackgroundColor(Color.parseColor(APP_BACKGROUND))
    ViewCompat.setOnApplyWindowInsetsListener(findViewById(android.R.id.content)) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime(),
      )
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
  }
}
