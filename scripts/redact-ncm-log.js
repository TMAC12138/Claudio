let pending = '';
let inCookieArray = false;

function redactLine(line) {
  const arrayStart = line.match(/^(\s*cookie\s*:\s*)\[(.*)$/i);
  if (arrayStart) {
    const closingIndex = arrayStart[2].indexOf(']');
    if (closingIndex >= 0) {
      return `${arrayStart[1]}['[REDACTED]']${arrayStart[2].slice(closingIndex + 1)}`;
    }
    inCookieArray = true;
    return `${arrayStart[1]}[`;
  }

  if (inCookieArray) {
    const closingIndex = line.indexOf(']');
    if (closingIndex >= 0) {
      inCookieArray = false;
      return `${line.slice(0, line.search(/\S|$/))}]${line.slice(closingIndex + 1)}`;
    }
    return `${line.match(/^\s*/)[0]}'[REDACTED]',`;
  }

  const scalarCookie = line.match(/^(\s*cookie\s*:\s*).+?(,?)$/i);
  if (scalarCookie) return `${scalarCookie[1]}'[REDACTED]'${scalarCookie[2]}`;
  return line;
}

function writeCompleteLines() {
  const lines = pending.split('\n');
  pending = lines.pop();
  for (const line of lines) process.stdout.write(`${redactLine(line)}\n`);
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  pending += chunk;
  writeCompleteLines();
});
process.stdin.on('end', () => {
  if (pending) process.stdout.write(redactLine(pending));
});
