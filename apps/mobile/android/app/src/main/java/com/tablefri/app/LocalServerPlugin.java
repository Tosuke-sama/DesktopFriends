package com.tablefri.app;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.text.format.Formatter;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import fi.iki.elonen.NanoHTTPD;

@CapacitorPlugin(name = "LocalServer")
public class LocalServerPlugin extends Plugin {
    private static final String TAG = "LocalServerPlugin";
    private static final int HTTP_PORT_OFFSET = 100; // HTTP 端口 = WebSocket 端口 + 100

    private TableFriServer wsServer;
    private TableFriHttpServer httpServer;
    private int currentPort = 3000;
    private int httpPort = 3100;
    private String currentIP = "";

    // 存储连接的客户端信息
    private final Map<String, PetInfo> connectedPets = new ConcurrentHashMap<>();

    @PluginMethod
    public void startServer(PluginCall call) {
        int port = call.getInt("port", 3000);

        if (wsServer != null && wsServer.isRunning()) {
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("port", currentPort);
            ret.put("ip", currentIP);
            call.resolve(ret);
            return;
        }

        try {
            currentIP = getLocalIpAddress();
            currentPort = port;
            httpPort = port; // HTTP 和 WebSocket 使用相同端口（NanoHTTPD 优先处理 HTTP）

            // 先启动 HTTP 服务器（用于服务发现）- 因为它也能处理 WebSocket 升级
            httpServer = new TableFriHttpServer(port);
            httpServer.start();

            // 启动 WebSocket 服务器在不同端口
            int wsPort = port + 1;
            wsServer = new TableFriServer(new InetSocketAddress(wsPort));
            wsServer.start();

            Log.i(TAG, "HTTP server started on " + currentIP + ":" + port);
            Log.i(TAG, "WebSocket server started on " + currentIP + ":" + wsPort);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("port", port);
            ret.put("ip", currentIP);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start server", e);
            // 清理已启动的服务器
            if (httpServer != null) {
                httpServer.stop();
                httpServer = null;
            }
            if (wsServer != null) {
                try { wsServer.stop(0); } catch (Exception ignored) {}
                wsServer = null;
            }
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("port", port);
            ret.put("ip", "");
            ret.put("error", e.getMessage());
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void stopServer(PluginCall call) {
        try {
            if (wsServer != null) {
                wsServer.stop(1000);
                wsServer = null;
            }
            if (httpServer != null) {
                httpServer.stop();
                httpServer = null;
            }
            connectedPets.clear();

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop server", e);
            JSObject ret = new JSObject();
            ret.put("success", false);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("running", wsServer != null && wsServer.isRunning());
        ret.put("port", currentPort);
        ret.put("ip", currentIP);
        ret.put("connectedClients", connectedPets.size());
        call.resolve(ret);
    }

    @PluginMethod
    public void getLocalIP(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ip", getLocalIpAddress());
        call.resolve(ret);
    }

    @PluginMethod
    public void broadcast(PluginCall call) {
        String event = call.getString("event", "");
        String data = call.getString("data", "");

        if (wsServer != null && wsServer.isRunning()) {
            try {
                JSONObject message = new JSONObject();
                message.put("event", event);
                message.put("data", new JSONObject(data));
                wsServer.broadcast(message.toString());

                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Exception e) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                call.resolve(ret);
            }
        } else {
            JSObject ret = new JSObject();
            ret.put("success", false);
            call.resolve(ret);
        }
    }

    private String getLocalIpAddress() {
        try {
            List<NetworkInterface> interfaces = Collections.list(NetworkInterface.getNetworkInterfaces());
            for (NetworkInterface intf : interfaces) {
                List<InetAddress> addrs = Collections.list(intf.getInetAddresses());
                for (InetAddress addr : addrs) {
                    if (!addr.isLoopbackAddress() && addr.getHostAddress().indexOf(':') < 0) {
                        return addr.getHostAddress();
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to get IP", e);
        }

        // Fallback: use WiFi manager
        try {
            WifiManager wifiManager = (WifiManager) getContext()
                    .getApplicationContext()
                    .getSystemService(Context.WIFI_SERVICE);
            int ipAddress = wifiManager.getConnectionInfo().getIpAddress();
            return Formatter.formatIpAddress(ipAddress);
        } catch (Exception e) {
            return "127.0.0.1";
        }
    }

    // 通知前端事件
    private void notifyEvent(String eventName, JSObject data) {
        notifyListeners(eventName, data);
    }

    // HTTP 服务器类 - 用于服务发现
    private class TableFriHttpServer extends NanoHTTPD {
        public TableFriHttpServer(int port) {
            super(port);
        }

        @Override
        public Response serve(IHTTPSession session) {
            String uri = session.getUri();
            Log.d(TAG, "HTTP request: " + uri);

            // CORS 头
            Response response;

            if ("/info".equals(uri)) {
                try {
                    JSONObject info = new JSONObject();
                    info.put("name", "TableFri Server");
                    info.put("version", "1.0.0");
                    info.put("ip", currentIP);
                    info.put("port", currentPort);
                    info.put("wsPort", currentPort + 1); // WebSocket 端口
                    info.put("pets", connectedPets.size());

                    response = newFixedLengthResponse(Response.Status.OK, "application/json", info.toString());
                } catch (Exception e) {
                    response = newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", "Error");
                }
            } else if ("/".equals(uri)) {
                response = newFixedLengthResponse(Response.Status.OK, "text/plain", "TableFri Server Running");
            } else {
                response = newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not Found");
            }

            // 添加 CORS 头
            response.addHeader("Access-Control-Allow-Origin", "*");
            response.addHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
            response.addHeader("Access-Control-Allow-Headers", "*");

            return response;
        }
    }

    // 内部 WebSocket 服务器类
    private class TableFriServer extends WebSocketServer {
        private boolean running = false;

        public TableFriServer(InetSocketAddress address) {
            super(address);
            setReuseAddr(true);
        }

        public boolean isRunning() {
            return running;
        }

        @Override
        public void onStart() {
            running = true;
            Log.i(TAG, "WebSocket server started");
        }

        @Override
        public void onOpen(WebSocket conn, ClientHandshake handshake) {
            Log.i(TAG, "Client connected: " + conn.getRemoteSocketAddress());

            // 发送服务器信息
            try {
                JSONObject info = new JSONObject();
                info.put("event", "welcome");
                JSONObject data = new JSONObject();
                data.put("name", "TableFri Server");
                data.put("version", "1.0.0");
                info.put("data", data);
                conn.send(info.toString());
            } catch (Exception e) {
                Log.e(TAG, "Failed to send welcome", e);
            }

            // 通知前端
            JSObject event = new JSObject();
            event.put("address", conn.getRemoteSocketAddress().toString());
            notifyEvent("clientConnected", event);
        }

        @Override
        public void onClose(WebSocket conn, int code, String reason, boolean remote) {
            String connId = conn.getRemoteSocketAddress().toString();
            Log.i(TAG, "Client disconnected: " + connId);

            // 移除宠物信息并广播
            PetInfo pet = connectedPets.remove(connId);
            if (pet != null) {
                broadcastPetOffline(pet.id);
            }

            // 通知前端
            JSObject event = new JSObject();
            event.put("address", connId);
            notifyEvent("clientDisconnected", event);
        }

        @Override
        public void onMessage(WebSocket conn, String message) {
            Log.d(TAG, "Message received: " + message);

            try {
                JSONObject json = new JSONObject(message);
                String event = json.getString("event");
                JSONObject data = json.optJSONObject("data");

                handleMessage(conn, event, data);

                // 通知前端
                JSObject jsEvent = new JSObject();
                jsEvent.put("event", event);
                jsEvent.put("data", message);
                jsEvent.put("from", conn.getRemoteSocketAddress().toString());
                notifyEvent("messageReceived", jsEvent);

            } catch (Exception e) {
                Log.e(TAG, "Failed to parse message", e);
            }
        }

        @Override
        public void onError(WebSocket conn, Exception ex) {
            Log.e(TAG, "WebSocket error", ex);
            if (conn == null) {
                running = false;
            }
        }

        private void handleMessage(WebSocket conn, String event, JSONObject data) {
            try {
                String connId = conn.getRemoteSocketAddress().toString();

                switch (event) {
                    case "pet:register":
                        // 注册宠物
                        PetInfo pet = new PetInfo();
                        pet.id = connId;
                        pet.name = data.optString("name", "Unknown");
                        pet.modelPath = data.optString("modelPath", "");
                        pet.joinedAt = System.currentTimeMillis();
                        connectedPets.put(connId, pet);

                        // 发送在线宠物列表
                        sendPetsList(conn);
                        // 广播新宠物上线
                        broadcastPetOnline(pet);
                        break;

                    case "pet:message":
                        // 转发消息
                        String content = data.optString("content", "");
                        String to = data.optString("to", null);
                        PetInfo sender = connectedPets.get(connId);

                        if (sender != null) {
                            JSONObject msg = new JSONObject();
                            msg.put("event", "pet:message");
                            JSONObject msgData = new JSONObject();
                            msgData.put("fromId", sender.id);
                            msgData.put("from", sender.name);
                            msgData.put("content", content);
                            msgData.put("timestamp", System.currentTimeMillis());
                            msg.put("data", msgData);

                            if (to != null) {
                                // 私聊
                                for (WebSocket ws : getConnections()) {
                                    if (ws.getRemoteSocketAddress().toString().equals(to)) {
                                        ws.send(msg.toString());
                                        break;
                                    }
                                }
                            } else {
                                // 广播给所有人
                                broadcast(msg.toString());
                            }
                        }
                        break;

                    case "pet:action":
                        // 转发动作
                        PetInfo actionPet = connectedPets.get(connId);
                        if (actionPet != null) {
                            JSONObject action = new JSONObject();
                            action.put("event", "pet:action");
                            JSONObject actionData = new JSONObject();
                            actionData.put("petId", actionPet.id);
                            actionData.put("petName", actionPet.name);
                            actionData.put("type", data.optString("type", "motion"));
                            actionData.put("name", data.optString("name", ""));
                            action.put("data", actionData);

                            // 广播给其他人
                            for (WebSocket ws : getConnections()) {
                                if (ws != conn) {
                                    ws.send(action.toString());
                                }
                            }
                        }
                        break;
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to handle message", e);
            }
        }

        private void sendPetsList(WebSocket conn) {
            try {
                JSONObject msg = new JSONObject();
                msg.put("event", "pets:list");
                JSONArray pets = new JSONArray();
                for (PetInfo pet : connectedPets.values()) {
                    JSONObject p = new JSONObject();
                    p.put("id", pet.id);
                    p.put("name", pet.name);
                    p.put("modelPath", pet.modelPath);
                    p.put("joinedAt", pet.joinedAt);
                    pets.put(p);
                }
                msg.put("data", pets);
                conn.send(msg.toString());
            } catch (Exception e) {
                Log.e(TAG, "Failed to send pets list", e);
            }
        }

        private void broadcastPetOnline(PetInfo pet) {
            try {
                JSONObject msg = new JSONObject();
                msg.put("event", "pet:online");
                JSONObject data = new JSONObject();
                data.put("id", pet.id);
                data.put("name", pet.name);
                data.put("modelPath", pet.modelPath);
                data.put("joinedAt", pet.joinedAt);
                msg.put("data", data);
                broadcast(msg.toString());
            } catch (Exception e) {
                Log.e(TAG, "Failed to broadcast pet online", e);
            }
        }

        private void broadcastPetOffline(String petId) {
            try {
                JSONObject msg = new JSONObject();
                msg.put("event", "pet:offline");
                msg.put("data", petId);
                broadcast(msg.toString());
            } catch (Exception e) {
                Log.e(TAG, "Failed to broadcast pet offline", e);
            }
        }
    }

    // 宠物信息类
    private static class PetInfo {
        String id;
        String name;
        String modelPath;
        long joinedAt;
    }
}
