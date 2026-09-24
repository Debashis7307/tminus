package dev.kartikeya.tminus

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val status = TextView(this).apply {
            textSize = 15f
            setPadding(48, 80, 48, 32)
            text = "T-minus\n\nA floating countdown to 6 December 2028.\n\nTap Start, then grant the overlay permission so the capsule can float above all apps."
        }

        val btn = Button(this).apply {
            text = "Start floating countdown"
            setOnClickListener {
                if (canOverlay()) {
                    startService()
                } else {
                    requestOverlay()
                }
            }
        }

        val stopBtn = Button(this).apply {
            text = "Stop"
            setOnClickListener {
                stopService(Intent(this@MainActivity, OverlayService::class.java))
            }
        }

        val layout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(32, 64, 32, 64)
            gravity = android.view.Gravity.CENTER_HORIZONTAL
            addView(status)
            addView(btn)
            addView(stopBtn)
        }

        setContentView(layout)
    }

    override fun onResume() {
        super.onResume()
        if (canOverlay()) {
            startService()
            finish()
        }
    }

    private fun canOverlay(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
            Settings.canDrawOverlays(this)
        else true

    private fun requestOverlay() {
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:$packageName")
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(intent)
    }

    private fun startService() {
        val intent = Intent(this, OverlayService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }
}
