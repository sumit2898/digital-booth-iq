import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { toast, Toaster } from 'sonner';
import { useUser } from './UserContext';

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children, userId }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchHistory = useCallback(async () => {
    if (!userId) return;
    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/notifications?user_id=${userId}`);
      const data = await response.json();
      if (Array.isArray(data)) {
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.read).length);
      } else {
        console.error('Expected notification array but got:', data);
        setNotifications([]);
      }
    } catch (e) {
      console.error('Error fetching notification history:', e);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return; // Don't connect if user is not authenticated

    fetchHistory();

    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'https://booth-iq-api.onrender.com';
    const wsUrl = backendUrl.replace(/^http/, 'ws');
    console.log('📡 Connecting to Notification Matrix:', `${wsUrl}/ws/notifications/${userId}`);
    const socket = new WebSocket(`${wsUrl}/ws/notifications/${userId}`);

    socket.onmessage = (event) => {
      const notification = JSON.parse(event.data);
      setNotifications(prev => Array.isArray(prev) ? [notification, ...prev] : [notification]);
      setUnreadCount(prev => prev + 1);
      
      // Trigger toast
      toast(notification.title, {
        description: notification.message,
        action: {
          label: 'View',
          onClick: () => console.log('Viewing notification:', notification.id)
        },
      });
    };

    socket.onopen = () => {
      console.log('✅ Notification Matrix Uplink Established');
    };

    socket.onerror = (error) => {
      console.error('❌ Notification Matrix Error:', error);
    };

    socket.onclose = (event) => {
      // On Vercel (1006 usually means WebSocket not supported), don't spam retries
      if (event.code === 1006) {
        console.warn('⚠️ Notification Matrix Unsupported in this environment (Vercel). Falling back to periodic sync.');
        return;
      }
      console.warn('⚠️ Notification Matrix Disconnected:', event.code, event.reason);
      // Attempt to reconnect after a delay for normal drops
      setTimeout(fetchHistory, 10000);
    };

    return () => socket.close();
  }, [userId, fetchHistory]);

  const markAsRead = async (id) => {
    try {
      await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications(prev => {
        if (!Array.isArray(prev)) return [];
        return prev.map(n => n.id === id ? { ...n, read: true } : n);
      });
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (e) {
      console.error('Error marking notification as read:', e);
    }
  };

  const markAllAsRead = async () => {
    if (!Array.isArray(notifications) || notifications.length === 0) return;
    
    // Filter out already read notifications
    const unreadNotifications = notifications.filter(n => !n.read);
    if (unreadNotifications.length === 0) return;

    try {
      // Optimistic update
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);

      // Backend calls in parallel for maximum speed
      await Promise.all(unreadNotifications.map(n => 
        fetch(`${process.env.REACT_APP_BACKEND_URL}/api/notifications/${n.id}/read`, { method: 'PATCH' })
      ));
    } catch (e) {
      console.error('Error marking all as read:', e);
      fetchHistory(); // Sync back with server on error
    }
  };

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead }}>
      {children}
      <Toaster position="top-right" richColors expand={true} />
    </NotificationContext.Provider>
  );
};
