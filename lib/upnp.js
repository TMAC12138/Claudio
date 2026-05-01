import { createSocket } from 'dgram';
import { parseString } from 'xml2js';

let cachedDevices = [];
let lastScan = 0;
const CACHE_TTL = 60000; // 60 seconds

const SSDP_ADDR = '239.255.255.250';
const SSDP_PORT = 1900;
const SEARCH_TARGET = 'urn:schemas-upnp-org:device:MediaRenderer:1';

export async function discover(timeout = 3000) {
  const now = Date.now();
  if (cachedDevices.length && now - lastScan < CACHE_TTL) {
    return cachedDevices;
  }

  return new Promise((resolve) => {
    const devices = [];
    const socket = createSocket('udp4');

    const searchMsg = [
      'M-SEARCH * HTTP/1.1',
      `HOST: ${SSDP_ADDR}:${SSDP_PORT}`,
      'MAN: "ssdp:discover"',
      'MX: 3',
      `ST: ${SEARCH_TARGET}`,
      '', '',
    ].join('\r\n');

    socket.on('message', (msg, rinfo) => {
      const headers = msg.toString();
      const locationMatch = headers.match(/LOCATION:\s*(.+)/i);
      if (locationMatch) {
        devices.push({
          host: rinfo.address,
          port: rinfo.port,
          location: locationMatch[1].trim(),
          name: rinfo.address,
        });
      }
    });

    socket.send(searchMsg, SSDP_PORT, SSDP_ADDR, (err) => {
      if (err) {
        socket.close();
        resolve(cachedDevices);
      }
    });

    setTimeout(async () => {
      socket.close();

      // Fetch device descriptions
      const enriched = await Promise.all(devices.map(async (d) => {
        try {
          const res = await fetch(d.location);
          const xml = await res.text();
          return new Promise((resolve) => {
            parseString(xml, (err, result) => {
              if (err) return resolve(d);
              const device = result?.root?.device?.[0];
              resolve({
                ...d,
                name: device?.friendlyName?.[0] || d.name,
                manufacturer: device?.manufacturer?.[0] || '',
                udn: device?.UDN?.[0] || '',
              });
            });
          });
        } catch {
          return d;
        }
      }));

      cachedDevices = enriched;
      lastScan = Date.now();
      resolve(enriched);
    }, timeout);
  });
}

export async function play(deviceUrl, audioUrl) {
  const controlUrl = new URL(deviceUrl);
  controlUrl.pathname = '/AVTransport/control';

  const soap = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:SetAVTransportURI xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
      <CurrentURI>${audioUrl}</CurrentURI>
      <CurrentURIMetaData></CurrentURIMetaData>
    </u:SetAVTransportURI>
  </s:Body>
</s:Envelope>`;

  await fetch(controlUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset="utf-8"',
      'SOAPAction': '"urn:schemas-upnp-org:service:AVTransport:1#SetAVTransportURI"',
    },
    body: soap,
  });

  // Then send Play
  const playSoap = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
      <Speed>1</Speed>
    </u:Play>
  </s:Body>
</s:Envelope>`;

  await fetch(controlUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset="utf-8"',
      'SOAPAction': '"urn:schemas-upnp-org:service:AVTransport:1#Play"',
    },
    body: playSoap,
  });

  return { status: 'playing', url: audioUrl };
}

export async function stop(deviceUrl) {
  const controlUrl = new URL(deviceUrl);
  controlUrl.pathname = '/AVTransport/control';

  const soap = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:Stop xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
    </u:Stop>
  </s:Body>
</s:Envelope>`;

  await fetch(controlUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset="utf-8"',
      'SOAPAction': '"urn:schemas-upnp-org:service:AVTransport:1#Stop"',
    },
    body: soap,
  });

  return { status: 'stopped' };
}

export function getDevices() {
  return cachedDevices;
}
