/* */ 
var $export = require('./$.export'),
    _isFinite = require('./$.global').isFinite;
$export($export.S, 'Number', {isFinite: function isFinite(it) {
    return typeof it == 'number' && _isFinite(it);
  }});
