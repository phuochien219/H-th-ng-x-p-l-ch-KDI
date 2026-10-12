/**
 * GOOGLE MAPS: lấy tọa độ từ link Google Maps và tính khoảng cách đi XE MÁY
 * từ nhà GV / trợ giảng đến trường.
 *
 * - Không cần API key: dùng dịch vụ Maps có sẵn của Apps Script (chế độ lái xe,
 *   TRÁNH ĐƯỜNG CAO TỐC – xe máy không được đi cao tốc nên đây là quãng đường xe máy).
 * - Có API key (Cấu hình → maps_api_key): dùng Routes API chế độ TWO_WHEELER (xe 2 bánh),
 *   tính theo ma trận nên nhanh hơn nhiều.
 * - Kết quả lưu ở sheet KhoangCach kèm tọa độ đã dùng; khi đổi link/tọa độ hệ thống tự tính lại.
 * - Mỗi lần chạy tối đa ~4 phút (giới hạn Apps Script 6 phút); giao diện web tự gọi lại
 *   cho tới khi xong.
 */

var MAPS_TIME_BUDGET_MS = 240000;
var MAPS_FLUSH_EVERY = 40;
var MAPS_SOURCE_DIRECTIONS = 'Google Maps – xe máy (tránh cao tốc)';
var MAPS_SOURCE_ROUTES = 'Google Routes API – xe 2 bánh';

/** Tra tọa độ cho link rút gọn (maps.app.goo.gl), link không chứa tọa độ, hoặc địa chỉ chữ. */
function resolveCoordsRemote_(text) {
  var direct = parseMapsLink(text);
  if (direct) return direct;
  var s = str(text);
  if (/^https?:\/\//i.test(s)) {
    var url = s;
    for (var i = 0; i < 5; i++) {
      var resp = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true });
      var headers = resp.getHeaders() || {};
      var loc = headers.Location || headers.location;
      if (!loc) break;
      var p = parseMapsLink(loc);
      if (p) return p;
      url = loc;
    }
    var place = placeTextFromUrl_(url);
    return place ? geocode_(place) : null;
  }
  return geocode_(s);
}

/** Tên địa điểm trong link dạng .../maps/place/Ten+Truong/... hoặc ?q=Ten+Truong */
function placeTextFromUrl_(url) {
  var m = String(url).match(/\/maps\/place\/([^/@?]+)/) || String(url).match(/\/maps\/search\/([^/@?]+)/) || String(url).match(/[?&](?:q|query)=([^&]+)/);
  if (!m) return '';
  try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { return m[1].replace(/\+/g, ' '); }
}

function geocode_(text) {
  var r = Maps.newGeocoder().setRegion('vn').setLanguage('vi').geocode(text);
  if (r && r.status === 'OK' && r.results && r.results.length) {
    var loc = r.results[0].geometry.location;
    return { lat: Math.round(loc.lat * 1e6) / 1e6, lng: Math.round(loc.lng * 1e6) / 1e6 };
  }
  return null;
}

/** Quãng đường 1 cặp điểm qua dịch vụ Maps của Apps Script. {km, minutes} hoặc null. */
function directionsDistance_(from, to, avoidHighways) {
  var finder = Maps.newDirectionFinder()
    .setOrigin(from.lat, from.lng)
    .setDestination(to.lat, to.lng)
    .setMode(Maps.DirectionFinder.Mode.DRIVING);
  if (avoidHighways) finder.setAvoid(Maps.DirectionFinder.Avoid.HIGHWAYS);
  var res = finder.getDirections();
  if (!res || res.status !== 'OK' || !res.routes || !res.routes.length) return null;
  var leg = res.routes[0].legs[0];
  return { km: round1(leg.distance.value / 1000), minutes: Math.round(leg.duration.value / 60) };
}

/** Ma trận khoảng cách qua Routes API (cần API key). Trả về {'i|j': {km, minutes}}. */
function routesMatrix_(origins, destinations, apiKey, avoidHighways) {
  function wp(p) { return { waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } }; }
  function call(mode) {
    var body = { origins: origins.map(wp), destinations: destinations.map(wp), travelMode: mode };
    if (mode === 'DRIVE') body.routeModifiers = { avoidHighways: !!avoidHighways };
    var resp = UrlFetchApp.fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify(body),
      headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,duration,condition' },
    });
    return { code: resp.getResponseCode(), text: resp.getContentText() };
  }
  var r = call('TWO_WHEELER');
  if (r.code !== 200) r = call('DRIVE'); // khu vực chưa hỗ trợ xe 2 bánh
  if (r.code !== 200) throw new Error('Routes API lỗi ' + r.code + ': ' + r.text.slice(0, 200));
  var out = {};
  JSON.parse(r.text).forEach(function (e) {
    if (e.condition && e.condition !== 'ROUTE_EXISTS') return;
    if (e.distanceMeters === undefined) return;
    out[e.originIndex + '|' + e.destinationIndex] = { km: round1(e.distanceMeters / 1000), minutes: Math.round(parseFloat(e.duration || '0') / 60) };
  });
  return out;
}

/** Bước 1: điền Vĩ độ/Kinh độ cho các dòng có link Google Maps nhưng chưa có tọa độ. */
function fillCoordsFromLinks_(deadline) {
  var res = { updated: 0, failed: [] };
  ['schools', 'teachers', 'assistants'].forEach(function (table) {
    var pending = Db.read(table).filter(function (r) {
      return str(r.mapUrl) && (toNum(r.lat) === null || toNum(r.lng) === null);
    });
    var found = [];
    pending.forEach(function (r) {
      if (Date.now() > deadline) return;
      var p = null;
      try { p = resolveCoordsRemote_(r.mapUrl); } catch (e) { p = null; }
      if (p) found.push({ code: str(r.code).toUpperCase(), lat: p.lat, lng: p.lng });
      else res.failed.push(TABLES[table].label + ' ' + r.code + ' (' + str(r.name) + ')');
    });
    if (!found.length) return;
    withLock_(function () {
      var byCode = {};
      Db.read(table).forEach(function (r) { byCode[str(r.code).toUpperCase()] = r; });
      Db.update(table, found.filter(function (f) { return byCode[f.code]; }).map(function (f) {
        return { _row: byCode[f.code]._row, lat: f.lat, lng: f.lng };
      }));
    });
    res.updated += found.length;
  });
  return res;
}

/** Các cặp người–trường cần tính (chưa có số liệu hoặc tọa độ đã đổi), gần trước. */
function pendingDistancePairs_(ctx) {
  var limit = ctx.S.max_distance_km > 0 ? ctx.S.max_distance_km : 40;
  var schools = Object.keys(ctx.schools).map(function (c) { return ctx.schools[c]; })
    .filter(function (s) { return s.active && hasCoords_(s); });
  var pairs = [];
  Object.keys(ctx.people).forEach(function (code) {
    var p = ctx.people[code];
    if (!p.active || !hasCoords_(p)) return;
    schools.forEach(function (s) {
      var straight = haversineKm(p.lat, p.lng, s.lat, s.lng);
      if (straight > limit) return; // đường chim bay đã quá xa → chắc chắn quá xa
      var key = coordsKey_(p, s);
      var gm = ctx.maps[code + '|' + s.code];
      if (gm && gm.coords === key) return;
      pairs.push({ person: p, school: s, key: key, straight: straight });
    });
  });
  pairs.sort(function (a, b) { return a.straight - b.straight; });
  return pairs;
}

function saveDistances_(rows) {
  if (!rows.length) return;
  withLock_(function () {
    var existing = {};
    Db.read('distances').forEach(function (r) { existing[str(r.person).toUpperCase() + '|' + str(r.school).toUpperCase()] = r; });
    var updates = [];
    var inserts = [];
    rows.forEach(function (r) {
      var e = existing[r.person + '|' + r.school];
      if (e) updates.push(Object.assign({ _row: e._row }, r));
      else inserts.push(r);
    });
    Db.update('distances', updates);
    Db.append('distances', inserts);
  });
}

/**
 * Cập nhật tọa độ + khoảng cách. Gọi lặp lại tới khi remaining = 0.
 * Trả về { coordsUpdated, coordsFailed, computed, remaining, failedPairs, source, quotaExceeded }
 */
function updateMapsData_(user) {
  var started = Date.now();
  var deadline = started + MAPS_TIME_BUDGET_MS;
  var coords = fillCoordsFromLinks_(started + MAPS_TIME_BUDGET_MS / 3);
  Db.clearCache();
  var ctx = context_();
  var pairs = pendingDistancePairs_(ctx);
  var apiKey = str(ctx.S.maps_api_key);
  var source = apiKey ? MAPS_SOURCE_ROUTES : MAPS_SOURCE_DIRECTIONS;
  var buffer = [];
  var computed = 0;
  var failed = 0;
  var quotaExceeded = false;
  var now = nowString();
  function record(pair, r) {
    buffer.push({ person: pair.person.code, school: pair.school.code, km: r.km, minutes: r.minutes, source: source, coords: pair.key, updatedAt: now });
    computed++;
    if (buffer.length >= MAPS_FLUSH_EVERY) { saveDistances_(buffer); buffer = []; }
  }
  var i = 0;
  try {
    if (apiKey) {
      // Gom theo người: 1 người × tối đa 25 trường mỗi lần gọi ma trận.
      while (i < pairs.length && Date.now() < deadline) {
        var origin = pairs[i].person;
        var group = [];
        while (i < pairs.length && pairs[i].person === origin && group.length < 25) group.push(pairs[i++]);
        // Lấy thêm các cặp khác của cùng người (danh sách đã sắp theo khoảng cách nên có thể không liền nhau).
        for (var k = i; k < pairs.length && group.length < 25; k++) {
          if (pairs[k].person === origin) { group.push(pairs[k]); pairs.splice(k, 1); k--; }
        }
        var m = routesMatrix_([origin], group.map(function (g) { return g.school; }), apiKey, ctx.S.maps_avoid_highways);
        group.forEach(function (g, j) {
          var r = m['0|' + j];
          if (r) record(g, r); else failed++;
        });
      }
    } else {
      while (i < pairs.length && Date.now() < deadline) {
        var pair = pairs[i++];
        var r = directionsDistance_(pair.person, pair.school, ctx.S.maps_avoid_highways);
        if (r) record(pair, r); else failed++;
      }
    }
  } catch (e) {
    if (/too many times|quota|giới hạn/i.test(String(e && e.message))) quotaExceeded = true;
    else { saveDistances_(buffer); throw e; }
  }
  saveDistances_(buffer);
  var remaining = Math.max(0, pairs.length - i);
  audit_(user, 'Cập nhật Google Maps', 'KhoangCach', 'Tọa độ: ' + coords.updated + ', khoảng cách: ' + computed + ', còn lại: ' + remaining);
  return {
    coordsUpdated: coords.updated, coordsFailed: coords.failed, computed: computed, failedPairs: failed,
    remaining: quotaExceeded ? remaining : remaining, total: pairs.length, source: source, quotaExceeded: quotaExceeded,
    seconds: Math.round((Date.now() - started) / 1000),
  };
}

/** Menu trong Google Sheets. */
function menuUpdateMaps() {
  var ui = SpreadsheetApp.getUi();
  var user = requireSheetRole_('edit_teachers');
  var r = updateMapsData_(user);
  ui.alert('Google Maps',
    'Đã cập nhật tọa độ: ' + r.coordsUpdated + (r.coordsFailed.length ? ' (không đọc được ' + r.coordsFailed.length + ' link)' : '') +
    '\nĐã tính khoảng cách: ' + r.computed + ' cặp GV/TG – trường' +
    (r.remaining ? '\nCòn ' + r.remaining + ' cặp – hãy chạy lại chức năng này (hoặc dùng nút trên web, tự chạy tiếp).' : '\nĐã xong toàn bộ.') +
    (r.quotaExceeded ? '\n⚠ Đã hết hạn mức Google Maps hôm nay – chạy tiếp vào ngày mai.' : ''),
    ui.ButtonSet.OK);
}
