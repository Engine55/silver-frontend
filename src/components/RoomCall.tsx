// src/components/RoomCall.tsx - 修复版 WebRTC 组件
"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Video, Phone, PhoneOff, Copy, CheckCircle, Users, Settings, Wifi, WifiOff } from 'lucide-react';
import type {
  AnyWebSocketMessage,
  ConnectionStatus,
  RoomJoinedMessage,
  OfferMessage,
  AnswerMessage,
  IceCandidateMessage,
  UserJoinedMessage,
  UserLeftMessage,
  ErrorMessage
} from './types';

const WS_BASE = process.env.NODE_ENV === 'production'
  ? 'wss://your-backend-domain.com'
  : 'ws://localhost:8000';

const API_BASE = process.env.NODE_ENV === 'production'
  ? 'https://your-backend-domain.com'
  : 'http://localhost:8000';

export default function RoomCall() {
  const [roomId, setRoomId] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [isInCall, setIsInCall] = useState<boolean>(false);
  const [isWaiting, setIsWaiting] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('未连接');
  const [isWebSocketConnected, setIsWebSocketConnected] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [isClient, setIsClient] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 确保在客户端环境
  useEffect(() => {
    setIsClient(true);
  }, []);

  // WebRTC 配置
  const rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  // 初始化 WebRTC 连接
  const initializePeerConnection = useCallback((): RTCPeerConnection => {
    console.log('🔄 初始化 WebRTC 连接...');
    const pc = new RTCPeerConnection(rtcConfig);

    // 接收远程视频流
    pc.ontrack = (event) => {
      console.log('📺 收到远程视频流');
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        setConnectionStatus('已连接');
        setIsInCall(true);
        setIsWaiting(false);
      }
    };

    // 监听连接状态变化
    pc.onconnectionstatechange = () => {
      console.log('🔗 WebRTC 连接状态:', pc.connectionState);

      switch (pc.connectionState) {
        case 'connected':
          setConnectionStatus('已连接');
          setIsInCall(true);
          setIsWaiting(false);
          break;
        case 'connecting':
          setConnectionStatus('正在建立连接...');
          break;
        case 'disconnected':
          setConnectionStatus('连接断开');
          setIsInCall(false);
          break;
        case 'failed':
          setConnectionStatus('连接失败');
          setIsInCall(false);
          setIsWaiting(false);
          break;
        case 'closed':
          setConnectionStatus('连接关闭');
          setIsInCall(false);
          setIsWaiting(false);
          break;
      }
    };

    // 处理 ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && websocketRef.current?.readyState === WebSocket.OPEN) {
        console.log('🧊 发送 ICE candidate');
        websocketRef.current.send(JSON.stringify({
          type: 'ice-candidate',
          candidate: event.candidate.toJSON()
        }));
      }
    };

    pc.onicecandidateerror = (event) => {
      console.error('❌ ICE candidate 错误:', event);
    };

    return pc;
  }, []);

  // 获取本地媒体流
  const getLocalStream = useCallback(async (): Promise<MediaStream> => {
    if (!isClient) {
      throw new Error('不在客户端环境');
    }

    try {
      console.log('📷 请求访问摄像头和麦克风...');

      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      console.log('✅ 获取本地视频流成功');
      return stream;
    } catch (error) {
      console.error('❌ 获取媒体设备失败:', error);

      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          alert('请允许访问摄像头和麦克风权限');
        } else if (error.name === 'NotFoundError') {
          alert('未找到摄像头或麦克风设备');
        } else {
          alert(`获取媒体设备失败: ${error.message}`);
        }
      }

      throw error;
    }
  }, [isClient]);

  // 连接 WebSocket
  const connectWebSocket = useCallback(async (userId: string): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      console.log(`🔌 连接 WebSocket: ${userId}`);
      setConnectionStatus('正在连接WebSocket...');

      const ws = new WebSocket(`${WS_BASE}/ws/${userId}`);

      ws.onopen = () => {
        console.log('✅ WebSocket 连接成功');
        setIsWebSocketConnected(true);
        setConnectionStatus('未连接');
        resolve(ws);
      };

      ws.onmessage = async (event) => {
        try {
          const message: AnyWebSocketMessage = JSON.parse(event.data);
          console.log('📨 收到 WebSocket 消息:', message.type);
          await handleWebSocketMessage(message);
        } catch (error) {
          console.error('❌ 处理 WebSocket 消息失败:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('🔌 WebSocket 连接关闭:', event.code, event.reason);
        setIsWebSocketConnected(false);

        if (!event.wasClean) {
          setConnectionStatus('连接断开');
          // 自动重连
          reconnectTimeoutRef.current = setTimeout(() => {
            if (userId && !websocketRef.current) {
              connectWebSocket(userId).then(newWs => {
                websocketRef.current = newWs;
              }).catch(console.error);
            }
          }, 3000);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket 错误:', error);
        setIsWebSocketConnected(false);
        setConnectionStatus('连接失败');
        reject(error);
      };
    });
  }, []);

  // 处理 WebSocket 消息
  const handleWebSocketMessage = useCallback(async (message: AnyWebSocketMessage) => {
    switch (message.type) {
      case 'room-joined':
        await handleRoomJoined(message as RoomJoinedMessage);
        break;
      case 'user-joined':
        await handleUserJoined(message as UserJoinedMessage);
        break;
      case 'offer':
        await handleOffer(message as OfferMessage);
        break;
      case 'answer':
        await handleAnswer(message as AnswerMessage);
        break;
      case 'ice-candidate':
        await handleIceCandidate(message as IceCandidateMessage);
        break;
      case 'user-left':
        handleUserLeft(message as UserLeftMessage);
        break;
      case 'error':
        handleError(message as ErrorMessage);
        break;
      case 'room-reset':
      case 'rooms-reset':
        handleRoomReset();
        break;
      default:
        console.warn('⚠️ 未知消息类型:', message.type);
    }
  }, []);

  // 处理房间加入成功
  const handleRoomJoined = useCallback(async (message: RoomJoinedMessage) => {
    if (message.success) {
      console.log('✅ 成功加入房间:', message.room_id);

      if (message.is_room_full) {
        setConnectionStatus('正在建立连接...');
        setIsWaiting(true);

        // 房间满了，开始创建 offer
        if (peerConnectionRef.current) {
          try {
            const offer = await peerConnectionRef.current.createOffer();
            await peerConnectionRef.current.setLocalDescription(offer);

            console.log('📤 发送 offer');
            websocketRef.current?.send(JSON.stringify({
              type: 'offer',
              offer: offer
            }));
          } catch (error) {
            console.error('❌ 创建 offer 失败:', error);
            setConnectionStatus('连接失败');
          }
        }
      } else {
        setConnectionStatus('等待其他用户加入...');
        setIsWaiting(true);
      }
    } else {
      setConnectionStatus(message.message || '加入房间失败');
      setIsWaiting(false);
    }
  }, []);

  // 处理新用户加入
  const handleUserJoined = useCallback(async (message: UserJoinedMessage) => {
    console.log('👤 新用户加入:', message.user_id);
    setConnectionStatus('正在建立连接...');
  }, []);

  // 处理接收到的 offer
  const handleOffer = useCallback(async (message: OfferMessage) => {
    console.log('📨 收到 offer from:', message.from);

    if (!peerConnectionRef.current) {
      console.error('❌ PeerConnection 未初始化');
      return;
    }

    try {
      // 设置远程描述
      await peerConnectionRef.current.setRemoteDescription(message.offer);
      console.log('✅ 设置远程描述成功');

      // 创建 answer
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      console.log('✅ 创建 answer 成功');

      // 发送 answer
      websocketRef.current?.send(JSON.stringify({
        type: 'answer',
        answer: answer
      }));
      console.log('📤 发送 answer');

    } catch (error) {
      console.error('❌ 处理 offer 失败:', error);
      setConnectionStatus('连接失败');
    }
  }, []);

  // 处理接收到的 answer
  const handleAnswer = useCallback(async (message: AnswerMessage) => {
    console.log('📨 收到 answer from:', message.from);

    if (!peerConnectionRef.current) {
      console.error('❌ PeerConnection 未初始化');
      return;
    }

    try {
      await peerConnectionRef.current.setRemoteDescription(message.answer);
      console.log('✅ 设置远程 answer 成功');
    } catch (error) {
      console.error('❌ 处理 answer 失败:', error);
      setConnectionStatus('连接失败');
    }
  }, []);

  // 处理 ICE candidate
  const handleIceCandidate = useCallback(async (message: IceCandidateMessage) => {
    if (!peerConnectionRef.current) {
      return;
    }

    try {
      const candidate = new RTCIceCandidate(message.candidate);
      await peerConnectionRef.current.addIceCandidate(candidate);
      console.log('🧊 添加 ICE candidate 成功');
    } catch (error) {
      console.error('❌ 添加 ICE candidate 失败:', error);
    }
  }, []);

  // 处理用户离开
  const handleUserLeft = useCallback((message: UserLeftMessage) => {
    console.log('👋 用户离开:', message.user_id);
    setConnectionStatus('用户已离开');
    setIsInCall(false);
    setIsWaiting(false);

    // 清空远程视频
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  // 处理错误
  const handleError = useCallback((message: ErrorMessage) => {
    console.error('❌ 服务器错误:', message.message);
    setConnectionStatus(`错误: ${message.message}`);
    setIsWaiting(false);
  }, []);

  // 处理房间重置
  const handleRoomReset = useCallback(() => {
    console.log('🧹 房间已重置');
    endCall();
    alert('房间已被重置，请重新加入');
  }, []);

  // 加入房间
  const joinRoom = useCallback(async () => {
    if (!roomId.trim()) {
      alert('请输入房间号');
      return;
    }

    // 防止重复加入
    if (isWaiting || isInCall || isWebSocketConnected) {
      console.log('⚠️ 已在通话中或连接中，跳过重复加入');
      return;
    }

    const finalUserId = userId.trim() || `用户_${Date.now()}`;
    setUserId(finalUserId);

    try {
      // 1. 获取本地媒体流
      const stream = await getLocalStream();
      localStreamRef.current = stream;

      // 2. 初始化 WebRTC 连接
      const pc = initializePeerConnection();
      peerConnectionRef.current = pc;

      // 3. 添加本地流到 PeerConnection
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
        console.log('➕ 添加本地轨道:', track.kind);
      });

      // 4. 连接 WebSocket
      const ws = await connectWebSocket(finalUserId);
      websocketRef.current = ws;

      // 5. 发送加入房间消息
      ws.send(JSON.stringify({
        type: 'join-room',
        room_id: roomId
      }));

      console.log('🚀 加入房间请求已发送');

    } catch (error) {
      console.error('❌ 加入房间失败:', error);
      setConnectionStatus('连接失败');
      setIsWaiting(false);

      // 清理资源
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
    }
  }, [roomId, userId, getLocalStream, initializePeerConnection, connectWebSocket, isWaiting, isInCall, isWebSocketConnected]);

  // 结束通话
  const endCall = useCallback(() => {
    console.log('📞 结束通话');

    // 发送离开房间消息
    if (websocketRef.current?.readyState === WebSocket.OPEN) {
      websocketRef.current.send(JSON.stringify({
        type: 'leave-room'
      }));
    }

    // 关闭 WebSocket
    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }

    // 关闭 PeerConnection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // 停止本地流
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    // 清空视频元素
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    // 清理定时器
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // 重置状态
    setIsInCall(false);
    setIsWaiting(false);
    setIsWebSocketConnected(false);
    setConnectionStatus('未连接');
  }, []);

  // 复制房间号
  const copyRoomId = useCallback(async () => {
    if (!isClient || !roomId) return;

    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('❌ 复制失败:', error);
      // 降级方案
      const textArea = document.createElement('textarea');
      textArea.value = roomId;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [roomId, isClient]);

  // 生成随机房间号
  const generateRoomId = useCallback(() => {
    const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomId(randomId);
  }, []);

  // 测试连接
  const testConnection = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${API_BASE}/`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        alert(`✅ 服务器连接正常: ${result.message}\n在线用户: ${result.connected_users}\n活跃房间: ${result.active_rooms}`);
      } else {
        alert(`❌ 服务器响应错误: ${response.status}`);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        alert('❌ 连接超时，请检查服务器是否运行');
      } else {
        alert('❌ 无法连接到服务器，请确保后端服务运行在 http://localhost:8000');
      }
    }
  }, []);

  // 重置相关函数（保持与原版兼容）
  const resetRooms = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/reset-rooms`, {
        method: 'DELETE',
        headers: { 'Accept': 'application/json' }
      });

      if (response.ok) {
        const result = await response.json();
        alert(`✅ ${result.message}`);
      } else {
        alert('❌ 重置失败');
      }
    } catch (error) {
      console.error('❌ 重置房间失败:', error);
      alert('❌ 重置房间失败，请检查服务器连接');
    }
  }, []);

  const resetCurrentRoom = useCallback(async () => {
    if (!roomId.trim()) {
      alert('请先输入房间号');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/reset-room/${roomId}`, {
        method: 'DELETE',
        headers: { 'Accept': 'application/json' }
      });

      if (response.ok) {
        const result = await response.json();
        alert(`✅ ${result.message}`);
        endCall();
      } else {
        const result = await response.json();
        alert(`❌ ${result.message}`);
      }
    } catch (error) {
      console.error('❌ 重置房间失败:', error);
      alert('❌ 重置房间失败，请检查服务器连接');
    }
  }, [roomId, endCall]);

  // 清理函数
  useEffect(() => {
    return () => {
      endCall();
    };
  }, [endCall]);

  // 加载状态
  if (!isClient) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">正在加载视频通话...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* 顶部状态栏 */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <div className={`w-3 h-3 rounded-full ${
                connectionStatus === '已连接' ? 'bg-green-500' : 
                connectionStatus === '未连接' ? 'bg-gray-400' : 'bg-yellow-500'
              }`}></div>
              <span className="text-sm font-medium text-gray-700">
                状态: {connectionStatus}
              </span>
              <div className="flex items-center space-x-2">
                {isWebSocketConnected ? (
                  <Wifi className="w-4 h-4 text-green-500" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-500" />
                )}
                <span className="text-xs text-gray-500">
                  {isWebSocketConnected ? 'WebSocket已连接' : 'WebSocket未连接'}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={testConnection}
                className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-md transition"
                type="button"
              >
                <Settings className="inline w-4 h-4 mr-1" />
                测试连接
              </button>
              <button
                onClick={resetRooms}
                className="text-sm bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded-md transition"
                type="button"
              >
                🧹 清空所有房间
              </button>
              {roomId && (
                <button
                  onClick={resetCurrentRoom}
                  className="text-sm bg-orange-100 hover:bg-orange-200 text-orange-700 px-3 py-1 rounded-md transition"
                  type="button"
                >
                  🗑️ 清空房间 {roomId}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 加入房间界面 */}
        {!isInCall && !isWaiting && (
          <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
            <div className="text-center mb-8">
              <Video className="w-16 h-16 text-blue-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-800 mb-2">开始视频通话</h2>
              <p className="text-gray-600">输入房间信息，与朋友开始安全的视频通话</p>
            </div>

            <div className="max-w-md mx-auto space-y-6">
              {/* 用户名 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  用户名
                </label>
                <input
                  type="text"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="输入您的用户名（可选）"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* 房间号 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  房间号
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                    placeholder="输入或生成房间号"
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={generateRoomId}
                    className="px-4 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition"
                    type="button"
                  >
                    生成
                  </button>
                  {roomId && (
                    <button
                      onClick={copyRoomId}
                      className="px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition flex items-center"
                      type="button"
                    >
                      {copied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    </button>
                  )}
                </div>
              </div>

              <button
                onClick={joinRoom}
                disabled={!roomId.trim() || isWaiting || isInCall || isWebSocketConnected}
                className="w-full px-6 py-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition flex items-center justify-center text-lg font-medium"
                type="button"
              >
                <Phone className="w-6 h-6 mr-2" />
                {isWebSocketConnected ? '连接中...' : '加入房间'}
              </button>

              {roomId && (
                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="font-medium text-blue-800 mb-2">💡 分享给朋友:</h4>
                  <p className="text-sm text-blue-700">
                    房间号: <code className="bg-blue-100 px-2 py-1 rounded font-mono">{roomId}</code>
                  </p>
                  <p className="text-xs text-blue-600 mt-2">
                    让朋友在另一个设备上打开此页面，输入相同房间号即可开始通话
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 视频区域 */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-semibold text-gray-800">视频通话</h3>
            {(isInCall || isWaiting) && (
              <button
                onClick={endCall}
                className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition flex items-center"
                type="button"
              >
                <PhoneOff className="w-5 h-5 mr-2" />
                结束通话
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 本地视频 */}
            <div className="relative">
              <div className="bg-gray-900 rounded-xl overflow-hidden aspect-video">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-4 left-4 bg-black bg-opacity-70 text-white px-3 py-1 rounded-full text-sm">
                  {userId || '我'}
                </div>
              </div>
              <p className="text-sm text-gray-600 mt-2 text-center">本地视频</p>
            </div>

            {/* 远程视频 */}
            <div className="relative">
              <div className="bg-gray-900 rounded-xl overflow-hidden aspect-video">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-4 left-4 bg-black bg-opacity-70 text-white px-3 py-1 rounded-full text-sm">
                  房间: {roomId}
                </div>
                {!isInCall && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-80">
                    <div className="text-center text-white">
                      <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm opacity-75">
                        {isWaiting ? connectionStatus : '等待对方加入'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-600 mt-2 text-center">远程视频</p>
            </div>
          </div>

          {isWaiting && (
            <div className="mt-6 p-6 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl border border-yellow-200">
              <div className="text-center">
                <div className="animate-pulse text-yellow-600 mb-2">⏳</div>
                <h4 className="font-medium text-yellow-800 mb-2">{connectionStatus}</h4>
                <p className="text-sm text-yellow-700">
                  房间号: <span className="font-mono bg-yellow-100 px-2 py-1 rounded">{roomId}</span>
                </p>
                <p className="text-xs text-yellow-600 mt-2">
                  {isWebSocketConnected ? '分享房间号给朋友，让他们加入开始通话' : '正在连接服务器...'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}