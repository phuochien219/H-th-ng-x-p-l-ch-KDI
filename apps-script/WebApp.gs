/**
 * Điểm vào Web App.
 */

function doGet(e) {
  var t = HtmlService.createTemplateFromFile('Index');
  t.appTitle = APP.TITLE;
  return t.evaluate()
    .setTitle('KDI – Xếp lịch STEM')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Dùng trong template: <?!= include('Styles'); ?> */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
