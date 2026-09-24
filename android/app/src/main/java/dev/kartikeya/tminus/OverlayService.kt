package dev.kartikeya.tminus

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.view.Gravity
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

class OverlayService : Service() {

    private var windowManager: WindowManager? = null
    private var webView: WebView? = null
    private var layoutParams: WindowManager.LayoutParams? = null
    private val handler = Handler(Looper.getMainLooper())

    companion object {
        const val CHANNEL_ID = "tminus_overlay"
        const val NOTIF_ID = 1
    }

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "STOP") {
            stopSelf()
            return START_NOT_STICKY
        }

        ServiceCompat.startForeground(
            this, NOTIF_ID, buildNotification(),
            if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
        )

        if (webView == null) showOverlay()

        return START_STICKY
    }

    private fun showOverlay() {
        val dm = resources.displayMetrics
        val density = dm.density
        val screenDp = (dm.widthPixels / density).toInt()
        val widthDp = minOf(420, screenDp - 32)
        val widthPx = (widthDp * density).toInt()
        val heightPx = (58 * density).toInt()

        val lp = WindowManager.LayoutParams(
            widthPx,
            heightPx,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            x = 0
            y = 120
        }
        layoutParams = lp

        val wv = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = true
            setBackgroundColor(Color.TRANSPARENT)
            isHorizontalScrollBarEnabled = false
            isVerticalScrollBarEnabled = false

            addJavascriptInterface(AndroidBridge(), "Android")

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val url = request.url.toString()
                    if (url.startsWith("http://") || url.startsWith("https://")) {
                        startActivity(Intent(Intent.ACTION_VIEW, request.url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                        return true
                    }
                    return false
                }
            }

            loadUrl("file:///android_asset/web/index.html")
        }
        webView = wv
        windowManager?.addView(wv, lp)
    }

    fun resizeOverlay(heightDp: Int) {
        handler.post {
            val density = resources.displayMetrics.density
            val h = (heightDp.coerceIn(58, 900) * density).toInt()
            layoutParams?.let { lp ->
                lp.height = h
                windowManager?.updateViewLayout(webView, lp)
            }
        }
    }

    fun moveOverlay(dx: Float, dy: Float) {
        handler.post {
            layoutParams?.let { lp ->
                lp.x += dx.toInt()
                lp.y += dy.toInt()
                windowManager?.updateViewLayout(webView, lp)
            }
        }
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(CHANNEL_ID, "T-minus overlay", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Keeps the countdown floating above other apps"
            }
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(ch)
        }
    }

    private fun buildNotification(): Notification {
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val stop = PendingIntent.getService(
            this, 1,
            Intent(this, OverlayService::class.java).setAction("STOP"),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("T-minus")
            .setContentText("Countdown floating — tap to open")
            .setSmallIcon(R.drawable.ic_notification)
            .setOngoing(true)
            .setContentIntent(open)
            .addAction(R.drawable.ic_notification, "Stop", stop)
            .build()
    }

    override fun onDestroy() {
        super.onDestroy()
        webView?.let {
            windowManager?.removeView(it)
            it.destroy()
        }
        webView = null
    }

    override fun onBind(intent: Intent?): IBinder? = null

    inner class AndroidBridge {
        @JavascriptInterface
        fun resizeHeight(h: Double) = resizeOverlay(h.toInt())

        @JavascriptInterface
        fun moveOverlay(dx: Float, dy: Float) = this@OverlayService.moveOverlay(dx, dy)

        @JavascriptInterface
        fun hideWidget() {
            stopSelf()
        }
    }
}
