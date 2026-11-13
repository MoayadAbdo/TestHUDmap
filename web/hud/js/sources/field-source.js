import { cameraHeading, cameraPitch, smoothHeading } from '../core/compass.js';
import { wrap360 } from '../core/geo.js';

const MIN_SPEED_FOR_GPS_COURSE = 0.7;

/** iPhone only grants motion access when asked straight from a tap, so call this first in the tap handler. */
export async function requestMotionPermission(win = window) {
  const Orientation = win.DeviceOrientationEvent;
  if (!Orientation || typeof Orientation.requestPermission !== 'function') return true;
  try {
    return (await Orientation.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

/** Back camera + GPS + camera heading. Start it from a tap (browser permission rules). */
export function createFieldSource({ doc = document, nav = navigator, win = window } = {}) {
  const video = doc.createElement('video');
  video.muted = true;
  video.playsInline = true;
  let position = null;
  let accuracy = null;
  let heading = null;
  let compassSeen = false;
  let watchId = null;

  const screenAngle = () => win.screen?.orientation?.angle ?? win.orientation ?? 0;

  /** Android: absolute angles. iPhone: webkitCompassHeading, shifted by the screen turn (best effort, check on the phone). */
  let pitch = null;
  function onOrientation(event) {
    let h = null;
    if (event.webkitCompassHeading != null) h = wrap360(event.webkitCompassHeading + screenAngle());
    else if (event.absolute || event.type === 'deviceorientationabsolute') h = cameraHeading(event.alpha, event.beta, event.gamma);
    const p = cameraPitch(event.beta, event.gamma);
    if (p != null) pitch = pitch == null ? p : pitch + 0.25 * (p - pitch);
    if (h == null) return;
    compassSeen = true;
    heading = smoothHeading(heading, h);
  }

  let fixAt = 0;
  function onPosition(pos) {
    fixAt = Date.now();
    position = [pos.coords.latitude, pos.coords.longitude];
    accuracy = pos.coords.accuracy;
    const course = pos.coords.heading;
    if (!compassSeen && course != null && pos.coords.speed > MIN_SPEED_FOR_GPS_COURSE) heading = course;
  }

  const source = {
    frame: 'field',
    gpsError: '',
    async start() {
      win.addEventListener('deviceorientationabsolute', onOrientation);
      win.addEventListener('deviceorientation', onOrientation);

      // start GPS first, so a camera problem can't stop it
      watchId = nav.geolocation.watchPosition((pos) => { source.gpsError = ''; onPosition(pos); }, (err) => {
        source.gpsError = err.code === 1
          ? 'Location blocked: allow it (iPhone: Settings > Privacy > Location Services > Safari Websites)'
          : 'No GPS signal yet: go outside, away from buildings';
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });

      video.srcObject = await nav.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false,
      });
      await video.play();
    },
    stop() {
      win.removeEventListener('deviceorientationabsolute', onOrientation);
      win.removeEventListener('deviceorientation', onOrientation);
      if (watchId != null) nav.geolocation.clearWatch(watchId);
      video.srcObject?.getTracks().forEach((t) => t.stop());
    },
    getPosition() {
      return position ? { at: position, heading: heading ?? 0, pitch: pitch ?? 0, accuracy, hasHeading: heading != null, fixAt } : null;
    },
    getBackground() {
      return video;
    },
    /** Small JPEG of the camera view for Ground Control. */
    capturePhoto(width = 320, quality = 0.6) {
      if (!video.videoWidth) return Promise.resolve(null);
      const canvas = doc.createElement('canvas');
      canvas.width = width;
      canvas.height = Math.round((video.videoHeight / video.videoWidth) * width);
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    },
  };
  return source;
}
