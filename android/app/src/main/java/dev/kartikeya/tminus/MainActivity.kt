package dev.kartikeya.tminus

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var statusText: TextView
    private lateinit var startBtn: Button
    private lateinit var stopBtn: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        statusText = TextView(this).apply {
            textSize = 15f
            setPadding(48, 80, 48, 32)
            gravity = Gravity.CENTER
            text = "T-minus\n\nA floating countdown to 6 December 2028.\n\nTap Start, then grant the overlay permission so the capsule can float above all apps."
        }

        startBtn = Button(this).apply {
            text = "Start floating countdown"
            setOnClickListener {
                if (canOverlay()) {
                    launchService()
                } else {
                    Toast.makeText(this@MainActivity, "Grant the overlay permission, then come back", Toast.LENGTH_LONG).show()
                    requestOverlay()
                }
            }
        }

        stopBtn = Button(this).apply {
            text = "Stop countdown"
            setOnClickListener {
                stopService(Intent(this@MainActivity, OverlayService::class.java))
                Toast.makeText(this@MainActivity, "Countdown stopped", Toast.LENGTH_SHORT).show()
            }
        }

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 64, 32, 64)
            gravity = Gravity.CENTER_HORIZONTAL
            addView(statusText)
            addView(startBtn)
            addView(stopBtn)
        }

        setContentView(layout)
        updateUI()
    }

    override fun onResume() {
        super.onResume()
        updateUI()
    }

    private fun updateUI() {
        if (canOverlay()) {
            statusText.text = "T-minus\n\nOverlay permission granted.\n\nTap Start to launch the floating countdown capsule."
            startBtn.text = "Start floating countdown"
            startBtn.visibility = View.VISIBLE
        } else {
            statusText.text = "T-minus\n\nA floating countdown to 6 December 2028.\n\nTap Start, then grant the overlay permission so the capsule can float above all apps."
            startBtn.text = "Grant overlay permission"
            startBtn.visibility = View.VISIBLE
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

    private fun launchService() {
        val intent = Intent(this, OverlayService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
        Toast.makeText(this, "Countdown is floating! Check the top of your screen", Toast.LENGTH_LONG).show()
        finish()
    }
}
