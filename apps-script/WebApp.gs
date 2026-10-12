/**
 * Điểm vào Web App.
 */

function doGet(e) {
  var t = HtmlService.createTemplateFromFile('Index');
  t.appTitle = APP.TITLE;
  return t.evaluate()
    .setTitle('KDI – Xếp lịch STEM')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setFaviconUrl('https://www.gstatic.com/images/icons/material/system/2x/event_note_black_48dp.png');
}

/** Dùng trong template: <?!= include('Styles'); ?> */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
