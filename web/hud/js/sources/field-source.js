import { smoothHeading } from '../core/compass.js';
import { createHeadPose } from '../core/head-pose.js';
import { wrap360 } from '../core/geo.js';

const MIN_SPEED_FOR_GPS_COURSE = 0.7;

/** iPhone only grants motion access when asked straight from a tap, so call this first in the tap handler. */
export async function requestMotionPermission(win = window) {
  const Orientation = win.DeviceOrientationEvent;
  if (!Orientation || typeof Orientation.requestPermission !== 'function') return true;
  try {
    // iPhone: ask for both inside the same tap (steps need motion, head turning needs orientation)
    const asks = [Orientation.requestPermission(), win.DeviceMotionEvent?.requestPermission?.()].filter(Boolean);
    return (await Promise.all(asks)).every((answer) => answer === 'granted');
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

  // Head pose from the full 3D rotation (no flip when you look up and down). Android: absolute angles are
  // north-referenced. iPhone: north is learned slowly from webkitCompassHeading (it jumps 180° near level).
  const head = createHeadPose();
  let pitch = null;
  function onOrientation(event) {
    const absolute = event.absolute || event.type === 'deviceorientationabsolute';
    const iphone = event.webkitCompassHeading != null;
    if (!absolute && !iphone) return;           // Android's relative events: the absolute ones come too
    head.update({
      alpha: event.alpha, beta: event.beta, gamma: event.gamma, absolute,
      compass: iphone ? wrap360(event.webkitCompassHeading + screenAngle()) : null,
    });
    pitch = pitch == null ? head.pitch : pitch + 0.25 * (head.pitch - pitch);
    if (head.heading == null) return;
    compassSeen = true;
    heading = smoothHeading(heading, head.heading);
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
