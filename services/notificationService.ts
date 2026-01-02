
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    console.warn('This browser does not support desktop notification');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  const permission = await Notification.requestPermission();
  return permission === 'granted';
};

export const sendNotification = (title: string, body: string) => {
  if (Notification.permission === 'granted') {
    // Check if we are on mobile (where notifications might behave differently or be blocked)
    try {
        const notification = new Notification(title, {
            body,
            icon: '/favicon.ico', // Optional: standard icon
            tag: 'review-reminder' // Tag prevents stacking multiple notifications
        });
        
        notification.onclick = () => {
            window.focus();
            notification.close();
        };
    } catch (e) {
        console.error("Notification failed", e);
    }
  }
};

export const getNotificationPermissionState = (): NotificationPermission => {
    if (!('Notification' in window)) return 'denied';
    return Notification.permission;
};
