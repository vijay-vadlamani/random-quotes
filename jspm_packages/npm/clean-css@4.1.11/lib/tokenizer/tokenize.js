/* */ 
var Marker = require('./marker');
var Token = require('./token');
var formatPosition = require('../utils/format-position');
var Level = {
  BLOCK: 'block',
  COMMENT: 'comment',
  DOUBLE_QUOTE: 'double-quote',
  RULE: 'rule',
  SINGLE_QUOTE: 'single-quote'
};
var AT_RULES = ['@charset', '@import'];
var BLOCK_RULES = ['@-moz-document', '@document', '@-moz-keyframes', '@-ms-keyframes', '@-o-keyframes', '@-webkit-keyframes', '@keyframes', '@media', '@supports'];
var PAGE_MARGIN_BOXES = ['@bottom-center', '@bottom-left', '@bottom-left-corner', '@bottom-right', '@bottom-right-corner', '@left-bottom', '@left-middle', '@left-top', '@right-bottom', '@right-middle', '@right-top', '@top-center', '@top-left', '@top-left-corner', '@top-right', '@top-right-corner'];
var EXTRA_PAGE_BOXES = ['@footnote', '@footnotes', '@left', '@page-float-bottom', '@page-float-top', '@right'];
var REPEAT_PATTERN = /^\[\s{0,31}\d+\s{0,31}\]$/;
var RULE_WORD_SEPARATOR_PATTERN = /[\s\(]/;
var TAIL_BROKEN_VALUE_PATTERN = /[\s|\}]*$/;
function tokenize(source, externalContext) {
  var internalContext = {
    level: Level.BLOCK,
    position: {
      source: externalContext.source || undefined,
      line: 1,
      column: 0,
      index: 0
    }
  };
  return intoTokens(source, externalContext, internalContext, false);
}
function intoTokens(source, externalContext, internalContext, isNested) {
  var allTokens = [];
  var newTokens = allTokens;
  var lastToken;
  var ruleToken;
  var ruleTokens = [];
  var propertyToken;
  var metadata;
  var metadatas = [];
  var level = internalContext.level;
  var levels = [];
  var buffer = [];
  var buffers = [];
  var serializedBuffer;
  var roundBracketLevel = 0;
  var isQuoted;
  var isSpace;
  var isNewLineNix;
  var isNewLineWin;
  var isCommentStart;
  var wasCommentStart = false;
  var isCommentEnd;
  var wasCommentEnd = false;
  var isCommentEndMarker;
  var isEscaped;
  var wasEscaped = false;
  var seekingValue = false;
  var seekingPropertyBlockClosing = false;
  var position = internalContext.position;
  for (; position.index < source.length; position.index++) {
    var character = source[position.index];
    isQuoted = level == Level.SINGLE_QUOTE || level == Level.DOUBLE_QUOTE;
    isSpace = character == Marker.SPACE || character == Marker.TAB;
    isNewLineNix = character == Marker.NEW_LINE_NIX;
    isNewLineWin = character == Marker.NEW_LINE_NIX && source[position.index - 1] == Marker.NEW_LINE_WIN;
    isCommentStart = !wasCommentEnd && level != Level.COMMENT && !isQuoted && character == Marker.ASTERISK && source[position.index - 1] == Marker.FORWARD_SLASH;
    isCommentEndMarker = !wasCommentStart && !isQuoted && character == Marker.FORWARD_SLASH && source[position.index - 1] == Marker.ASTERISK;
    isCommentEnd = level == Level.COMMENT && isCommentEndMarker;
    roundBracketLevel = Math.max(roundBracketLevel, 0);
    metadata = buffer.length === 0 ? [position.line, position.column, position.source] : metadata;
    if (isEscaped) {
      buffer.push(character);
    } else if (!isCommentEnd && level == Level.COMMENT) {
      buffer.push(character);
    } else if (isCommentStart && (level == Level.BLOCK || level == Level.RULE) && buffer.length > 1) {
      metadatas.push(metadata);
      buffer.push(character);
      buffers.push(buffer.slice(0, buffer.length - 2));
      buffer = buffer.slice(buffer.length - 2);
      metadata = [position.line, position.column - 1, position.source];
      levels.push(level);
      level = Level.COMMENT;
    } else if (isCommentStart) {
      levels.push(level);
      level = Level.COMMENT;
      buffer.push(character);
    } else if (isCommentEnd) {
      serializedBuffer = buffer.join('').trim() + character;
      lastToken = [Token.COMMENT, serializedBuffer, [originalMetadata(metadata, serializedBuffer, externalContext)]];
      newTokens.push(lastToken);
      level = levels.pop();
      metadata = metadatas.pop() || null;
      buffer = buffers.pop() || [];
    } else if (isCommentEndMarker && source[position.index + 1] != Marker.ASTERISK) {
      externalContext.warnings.push('Unexpected \'*/\' at ' + formatPosition([position.line, position.column, position.source]) + '.');
      buffer = [];
    } else if (character == Marker.SINGLE_QUOTE && !isQuoted) {
      levels.push(level);
      level = Level.SINGLE_QUOTE;
      buffer.push(character);
    } else if (character == Marker.SINGLE_QUOTE && level == Level.SINGLE_QUOTE) {
      level = levels.pop();
      buffer.push(character);
    } else if (character == Marker.DOUBLE_QUOTE && !isQuoted) {
      levels.push(level);
      level = Level.DOUBLE_QUOTE;
      buffer.push(character);
    } else if (character == Marker.DOUBLE_QUOTE && level == Level.DOUBLE_QUOTE) {
      level = levels.pop();
      buffer.push(character);
    } else if (!isCommentStart && !isCommentEnd && character != Marker.CLOSE_ROUND_BRACKET && character != Marker.OPEN_ROUND_BRACKET && level != Level.COMMENT && !isQuoted && roundBracketLevel > 0) {
      buffer.push(character);
    } else if (character == Marker.OPEN_ROUND_BRACKET && !isQuoted && level != Level.COMMENT && !seekingValue) {
      buffer.push(character);
      roundBracketLevel++;
    } else if (character == Marker.CLOSE_ROUND_BRACKET && !isQuoted && level != Level.COMMENT && !seekingValue) {
      buffer.push(character);
      roundBracketLevel--;
    } else if (character == Marker.SEMICOLON && level == Level.BLOCK && buffer[0] == Marker.AT) {
      serializedBuffer = buffer.join('').trim();
      allTokens.push([Token.AT_RULE, serializedBuffer, [originalMetadata(metadata, serializedBuffer, externalContext)]]);
      buffer = [];
    } else if (character == Marker.COMMA && level == Level.BLOCK && ruleToken) {
      serializedBuffer = buffer.join('').trim();
      ruleToken[1].push([tokenScopeFrom(ruleToken[0]), serializedBuffer, [originalMetadata(metadata, serializedBuffer, externalContext, ruleToken[1].length)]]);
      buffer = [];
    } else if (character == Marker.COMMA && level == Level.BLOCK && tokenTypeFrom(buffer) == Token.AT_RULE) {
      buffer.push(character);
    } else if (character == Marker.COMMA && level == Level.BLOCK) {
      ruleToken = [tokenTypeFrom(buffer), [], []];
      serializedBuffer = buffer.join('').trim();
      ruleToken[1].push([tokenScopeFrom(ruleToken[0]), serializedBuffer, [originalMetadata(metadata, serializedBuffer, externalContext, 0)]]);
      buffer = [];
    } else if (character == Marker.OPEN_CURLY_BRACKET && level == Level.BLOCK && ruleToken && ruleToken[0] == Token.NESTED_BLOCK) {
      serializedBuffer = buffer.join('').trim();
      ruleToken[1].push([Token.NESTED_BLOCK_SCOPE, serializedBuffer, [originalMetadata(metadata, serializedBuffer, externalContext)]]);
      allTokens.push(ruleToken);
      levels.push(level);
      position.column++;
      position.index++;
      buffer = [];
      ruleToken[2] = intoTokens(source, externalContext, internalContext, true);
      ruleToken = null;
    } else if (character == Marker.OPEN_CURLY_BRACKET && level == Level.BLOCK && tokenTypeFrom(buffer) == Token.NESTED_BLOCK) {
      serializedBuffer = buffer.join('').trim();
      ruleToken = ruleToken || [Token.NESTED_BLOCK, [], []];
      ruleToken[1].push([Token.NESTED_BLOCK_SCOPE, serializedBuffer, [originalMetadata(metadata, serializedBuffer, externalContext)]]);
      allTokens.push(ruleToken);
      levels.push(level);
      position.column++;
      position.index++;
      buffer = [];
      ruleToken[2] = intoTokens(source, externalContext, internalContext, true);
      ruleToken = null;
    } else if (character == Marker.OPEN_CURLY_BRACKET && level == Level.BLOCK) {
      serializedBuffer = buffer.join('').trim();
      ruleToken = ruleToken || [tokenTypeFrom(buffer), [], []];
      ruleToken[1].push([tokenScopeFrom(ruleToken[0]), serializedBuffer, [originalMetadata(metadata, serializedBuffer, externalContext, ruleToken[1].length)]]);
      newTokens = ruleToken[2];
      allTokens.push(ruleToken);
      levels.push(level);
      level = Level.RULE;
      buffer = [];
    } else if (character == Marker.OPEN_CURLY_BRACKET && level == Level.RULE && seekingValue) {
      ruleTokens.push(ruleToken);
      ruleToken = [Token.PROPERTY_BLOCK, []];
      propertyToken.push(ruleToken);
      newTokens = ruleToken[1];
      levels.push(level);
      level = Level.RULE;
      seekingValue = false;
    } else if (character == Marker.OPEN_CURLY_BRACKET && level == Level.RULE && isPageMarginBox(buffer)) {
      serializedBuffer = buffer.join('').trim();
      ruleTokens.push(ruleToken);
      ruleToken = [Token.AT_RULE_BLOCK, [], []];
      ruleToken[1].push([Token.AT_RULE_BLOCK_SCOPE, serializedBuffer, [originalMetadata(metadata, serializedBuffer, externalContext)]]);
      newTokens.push(ruleToken);
      newTokens = ruleToken[2];
      levels.push(level);
      level = Level.RULE;
      buffer = [];
    } else if (character == Marker.COLON && level == Level.RULE && !seekingValue) {
      serializedBuffer = buffer.join('').trim();
      propertyToken = [Token.PROPERTY, [Token.PROPERTY_NAME, serializedBuffer, [originalMetadata(metadata, serializedBuffer, externalContext)]]];
      newTokens.push(propertyToken);
      seekingValue = true;
      buffer = [];
    } else if (character == Marker.SEMICOLON && level == Level.RULE && propertyToken && ruleTokens.length > 0 && buffer.length > 0 && buffer[0] == Marker.AT) {
      serializedBuffer = buffer.join('').trim();
      ruleToken[1].push([Token.AT_RULE, serializedBuffer, [originalMetadata(metadata, serializedBuffer, externalContext)]]);
      buffer = [];
    } else if (character == Marker.SEMICOLON && level == Level.RULE && propertyToken && buffer.length > 0) {
      serializedBuffer = buffer.join('').trim();
      propertyToken.push([Token.PROPERTY_VALUE, serializedBuffer, [originalMetadata(metadata, serializedBuffer, externalContext)]]);
      propertyToken = null;
      seekingValue = false;
      buffer = [];
    } else if (character == Marker.SEMICOLON && level == Level.RULE && propertyToken && buffer.length === 0) {
      propertyToken = null;
      seekingValue = false;
    } else if (character == Marker.SEMICOLON && level == Level.RULE && buffer.length > 0 && buffer[0] == Marker.AT) {
      serializedBuffer = buffer.join('');
      newTokens.push([Token.AT_RULE, serializedBuffer, [originalMetadata(metadata, serializedBuffer, externalContext)]]);
      seekingValue = false;
      buffer = [];
    } else if (character == Marker.SEMICOLON && level == Level.RULE && seekingPropertyBlockClosing) {
      seekingPropertyBlockClosing = false;
      buffer = [];
    } else if (character == Marker.SEMICOLON && level == Level.RULE && buffer.length === 0) {} else if (character == Marker.CLOSE_CURLY_BRACKET && level == Level.RULE && propertyToken && seekingValue && buffer.length > 0 && ruleTokens.length > 0) {
      serializedBuffer = buffer.join('');
      propertyToken.push([Token.PROPERTY_VALUE, serializedBuffer, [originalMetadata(metadata, serializedBuffer, externalContext)]]);
      propertyToken = null;
      ruleToken = ruleTokens.pop();
      newTokens = ruleToken[2];
      level = levels.pop();
      seekingValue = false;
      buffer = [];
    } else if (character == Marker.CLOSE_CURLY_BRACKET && level == Level.RULE && propertyToken && buffer.length > 0 && buffer[0] == Marker.AT && ruleTokens.length > 0) {
      serializedBuffer = buffer.join('');
      ruleToken[1].push([Token.AT_RULE, serializedBuffer, [originalMetadata(metadata, serializedBuffer, externalContext)]]);
      propertyToken = null;
      ruleToken = ruleTokens.pop();
      newTokens = ruleToken[2];
      level = levels.pop();
      seekingValue = false;
      buffer = [];
    } else if (character == Marker.CLOSE_CURLY_BRACKET && level == Level.RULE && propertyToken && ruleTokens.length > 0) {
      propertyToken = null;
      ruleToken = ruleTokens.pop();
      newTokens = ruleToken[2];
      level = levels.pop();
      seekingValue = false;
    } else if (character == Marker.CLOSE_CURLY_BRACKET && level == Level.RULE && propertyToken && buffer.length > 0) {
      serializedBuffer = buffer.join('');
      propertyToken.push([Token.PROPERTY_VALUE, serializedBuffer, [originalMetadata(metadata, serializedBuffer, externalContext)]]);
      propertyToken = null;
      ruleToken = ruleTokens.pop();
      newTokens = allTokens;
      level = levels.pop();
      seekingValue = false;
      buffer = [];
    } else if (character == Marker.CLOSE_CURLY_BRACKET && level == Level.RULE && buffer.length > 0 && buffer[0] == Marker.AT) {
      propertyToken = null;
      ruleToken = null;
      serializedBuffer = buffer.join('').trim();
      newTokens.push([Token.AT_RULE, serializedBuffer, [originalMetadata(metadata, serializedBuffer, externalContext)]]);
      newTokens = allTokens;
      level = levels.pop();
      seekingValue = false;
      buffer = [];
    } else if (character == Marker.CLOSE_CURLY_BRACKET && level == Level.RULE && levels[levels.length - 1] == Level.RULE) {
      propertyToken = null;
      ruleToken = ruleTokens.pop();
      newTokens = ruleToken[2];
      level = levels.pop();
      seekingValue = false;
      seekingPropertyBlockClosing = true;
      buffer = [];
    } else if (character == Marker.CLOSE_CURLY_BRACKET && level == Level.RULE) {
      propertyToken = null;
      ruleToken = null;
      newTokens = allTokens;
      level = levels.pop();
      seekingValue = false;
    } else if (character == Marker.CLOSE_CURLY_BRACKET && level == Level.BLOCK && !isNested && position.index <= source.length - 1) {
      externalContext.warnings.push('Unexpected \'}\' at ' + formatPosition([position.line, position.column, position.source]) + '.');
      buffer.push(character);
    } else if (character == Marker.CLOSE_CURLY_BRACKET && level == Level.BLOCK) {
      break;
    } else if (character == Marker.OPEN_ROUND_BRACKET && level == Level.RULE && seekingValue) {
      buffer.push(character);
      roundBracketLevel++;
    } else if (character == Marker.CLOSE_ROUND_BRACKET && level == Level.RULE && seekingValue && roundBracketLevel == 1) {
      buffer.push(character);
      serializedBuffer = buffer.join('').trim();
      propertyToken.push([Token.PROPERTY_VALUE, serializedBuffer, [originalMetadata(metadata, serializedBuffer, externalContext)]]);
      roundBracketLevel--;
      buffer = [];
    } else if (character == Marker.CLOSE_ROUND_BRACKET && level == Level.RULE && seekingValue) {
      buffer.push(character);
      roundBracketLevel--;
    } else if (character == Marker.FORWARD_SLASH && source[position.index + 1] != Marker.ASTERISK && level == Level.RULE && seekingValue && buffer.length > 0) {
      serializedBuffer = buffer.join('').trim();
      propertyToken.push([Token.PROPERTY_VALUE, serializedBuffer, [originalMetadata(metadata, serializedBuffer, externalContext)]]);
      propertyToken.push([Token.PROPERTY_VALUE, character, [[position.line, position.column, position.source]]]);
      buffer = [];
    } else if (character == Marker.FORWARD_SLASH && source[position.index + 1] != Marker.ASTERISK && level == Level.RULE && seekingValue) {
      propertyToken.push([Token.PROPERTY_VALUE, character, [[position.line, position.column, position.source]]]);
      buffer = [];
    } else if (character == Marker.COMMA && level == Level.RULE && seekingValue && buffer.length > 0) {
      serializedBuffer = buffer.join('').trim();
      propertyToken.push([Token.PROPERTY_VALUE, serializedBuffer, [originalMetadata(metadata, serializedBuffer, externalContext)]]);
      propertyToken.push([Token.PROPERTY_VALUE, character, [[position.line, position.column, position.source]]]);
      buffer = [];
    } else if (character == Marker.COMMA && level == Level.RULE && seekingValue) {
      propertyToken.push([Token.PROPERTY_VALUE, character, [[position.line, position.column, position.source]]]);
      buffer = [];
    } else if (character == Marker.CLOSE_SQUARE_BRACKET && propertyToken && propertyToken.length > 1 && buffer.length > 0 && isRepeatToken(buffer)) {
      buffer.push(character);
      serializedBuffer = buffer.join('').trim();
      propertyToken[propertyToken.length - 1][1] += serializedBuffer;
      buffer = [];
    } else if ((isSpace || (isNewLineNix && !isNewLineWin)) && level == Level.RULE && seekingValue && propertyToken && buffer.length > 0) {
      serializedBuffer = buffer.join('').trim();
      propertyToken.push([Token.PROPERTY_VALUE, serializedBuffer, [originalMetadata(metadata, serializedBuffer, externalContext)]]);
      buffer = [];
    } else if (isNewLineWin && level == Level.RULE && seekingValue && propertyToken && buffer.length > 1) {
      serializedBuffer = buffer.join('').trim();
      propertyToken.push([Token.PROPERTY_VALUE, serializedBuffer, [originalMetadata(metadata, serializedBuffer, externalContext)]]);
      buffer = [];
    } else if (isNewLineWin && level == Level.RULE && seekingValue) {
      buffer = [];
    } else if (buffer.length == 1 && isNewLineWin) {
      buffer.pop();
    } else if (buffer.length > 0 || !isSpace && !isNewLineNix && !isNewLineWin) {
      buffer.push(character);
    }
    wasEscaped = isEscaped;
    isEscaped = !wasEscaped && character == Marker.BACK_SLASH;
    wasCommentStart = isCommentStart;
    wasCommentEnd = isCommentEnd;
    position.line = (isNewLineWin || isNewLineNix) ? position.line + 1 : position.line;
    position.column = (isNewLineWin || isNewLineNix) ? 0 : position.column + 1;
  }
  if (seekingValue) {
    externalContext.warnings.push('Missing \'}\' at ' + formatPosition([position.line, position.column, position.source]) + '.');
  }
  if (seekingValue && buffer.length > 0) {
    serializedBuffer = buffer.join('').replace(TAIL_BROKEN_VALUE_PATTERN, '');
    propertyToken.push([Token.PROPERTY_VALUE, serializedBuffer, [originalMetadata(metadata, serializedBuffer, externalContext)]]);
    buffer = [];
  }
  if (buffer.length > 0) {
    externalContext.warnings.push('Invalid character(s) \'' + buffer.join('') + '\' at ' + formatPosition(metadata) + '. Ignoring.');
  }
  return allTokens;
}
function originalMetadata(metadata, value, externalContext, selectorFallbacks) {
  var source = metadata[2];
  return externalContext.inputSourceMapTracker.isTracking(source) ? externalContext.inputSourceMapTracker.originalPositionFor(metadata, value.length, selectorFallbacks) : metadata;
}
function tokenTypeFrom(buffer) {
  var isAtRule = buffer[0] == Marker.AT || buffer[0] == Marker.UNDERSCORE;
  var ruleWord = buffer.join('').split(RULE_WORD_SEPARATOR_PATTERN)[0];
  if (isAtRule && BLOCK_RULES.indexOf(ruleWord) > -1) {
    return Token.NESTED_BLOCK;
  } else if (isAtRule && AT_RULES.indexOf(ruleWord) > -1) {
    return Token.AT_RULE;
  } else if (isAtRule) {
    return Token.AT_RULE_BLOCK;
  } else {
    return Token.RULE;
  }
}
function tokenScopeFrom(tokenType) {
  if (tokenType == Token.RULE) {
    return Token.RULE_SCOPE;
  } else if (tokenType == Token.NESTED_BLOCK) {
    return Token.NESTED_BLOCK_SCOPE;
  } else if (tokenType == Token.AT_RULE_BLOCK) {
    return Token.AT_RULE_BLOCK_SCOPE;
  }
}
function isPageMarginBox(buffer) {
  var serializedBuffer = buffer.join('').trim();
  return PAGE_MARGIN_BOXES.indexOf(serializedBuffer) > -1 || EXTRA_PAGE_BOXES.indexOf(serializedBuffer) > -1;
}
function isRepeatToken(buffer) {
  return REPEAT_PATTERN.test(buffer.join('') + Marker.CLOSE_SQUARE_BRACKET);
}
module.exports = tokenize;
