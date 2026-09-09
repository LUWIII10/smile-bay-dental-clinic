import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../../../api/notifications';
import { BellIcon, CheckCircleIcon } from '../icons';

// Notifications aren't as time-pressed as an action queue (HMO/pediatric
// queues poll at 9s) — 20s keeps the badge fresh without hammering the
// endpoint on every single portal page.
const POLL_INTERVAL_MS = 20000;

function timeAgo(iso) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// Same portal + fixed-position pattern ActionMenu.jsx uses — the topbar
// sits above content that can scroll, and a plain absolutely-positioned
// dropdown would get visually orphaned from its trigger the moment the
// page underneath it scrolls.
function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const result = await getNotifications();
      setNotifications(result.data);
      setUnreadCount(result.unread_count);
    } catch {
      // Silent — the bell just keeps showing its last-known state rather
      // than flashing an error over a small topbar widget.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const openPanel = () => {
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 10, right: window.innerWidth - rect.right });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;

    const handleClickOutside = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const handleDismiss = () => setOpen(false);

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
    };
  }, [open]);

  const handleSelect = async (notification) => {
    setOpen(false);
    if (!notification.read_at) {
      const now = new Date().toISOString();
      setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read_at: now } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        await markNotificationRead(notification.id);
      } catch {
        // Best-effort — worst case the badge re-shows it as unread next load.
      }
    }
    if (notification.url) navigate(notification.url);
  };

  const handleMarkAllRead = async (e) => {
    e.stopPropagation();
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || now })));
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
    } catch {
      // Best-effort.
    }
  };

  return (
    <div className="notif-bell">
      <button
        ref={triggerRef}
        type="button"
        className="portal-bell"
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPanel())}
      >
        <BellIcon />
        {unreadCount > 0 && <span className="notif-bell-dot" aria-hidden="true" />}
      </button>

      {open && position && createPortal(
        <div ref={dropdownRef} className="notif-panel" style={{ top: position.top, right: position.right }}>
          <div className="notif-panel-header">
            <span className="notif-panel-title">Notifications</span>
            {unreadCount > 0 && (
              <button type="button" className="notif-mark-all" onClick={handleMarkAllRead}>
                Mark all as read
              </button>
            )}
          </div>

          <div className="notif-panel-list">
            {loading ? (
              <div className="notif-panel-empty">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="notif-panel-empty">
                <CheckCircleIcon />
                <span>You're all caught up</span>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`notif-item${n.read_at ? '' : ' notif-item--unread'}`}
                  onClick={() => handleSelect(n)}
                >
                  <span className="notif-item-dot" aria-hidden="true" />
                  <span className="notif-item-text">
                    <span className="notif-item-title">{n.title}</span>
                    {n.body && <span className="notif-item-body">{n.body}</span>}
                    <span className="notif-item-time">{timeAgo(n.created_at)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default NotificationBell;
