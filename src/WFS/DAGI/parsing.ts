import { type LatLng, Point } from "leaflet";
import { EPSG25832 } from "../../util";
import { GenericArea } from "./Afstemningsomraade";
import { WfsMember, DagiMultiGeomResponse } from "./dagi-types";


export function getPolygonsFromDagiAreas<T extends keyof WfsMember>(dagiAreas: DagiMultiGeomResponse, key: T, idGenerator: (member: WfsMember[T]) => string) {
  const votingAreas = [dagiAreas['wfs:FeatureCollection']['wfs:member']].flatMap(c => c);
  const votingAreasTransformed: GenericArea[] = [];
  for (let votingArea of votingAreas) {
    const surfaceMembers = [votingArea[key]['dagi:geometri']['gml:MultiSurface']['gml:surfaceMember']].flatMap(c => c);
    const polygonsForDagiArea: LatLng[][] = [];
    for (let surfaceMember of surfaceMembers) {
      polygonsForDagiArea.push()
      let maxPolySize = 40;
      let points = surfaceMember['gml:Polygon']['gml:exterior']['gml:LinearRing']['gml:coordinates'].split(' ').map(c => c.split(','))
      if (points.length > maxPolySize) {
        points = new Array(maxPolySize).fill(0).map((_,i)=>points[Math.floor(i*points.length/maxPolySize)])  
      }
      
      polygonsForDagiArea.push(points.map(c => {
        return EPSG25832.unproject(new Point(+c[0], +c[1], false));
      }));
    }
    const id = idGenerator(votingArea[key]);
    votingAreasTransformed.push({ id, polygons: polygonsForDagiArea });
  }
  return votingAreasTransformed;
}

export function quickXmlParse(xml: string) {
  const o: any = {};
  let cur = o;
  let curName = ''
  let curContent: [number,number] = [-1,-1];
  let hasContent = false;
  for (let i = 0; i < xml.length; i++) {
    let curChar = xml[i];
    if (curChar === '<') { // Inside an opening or closing tag
      if (xml[i+1] === '/') { // Inside a closing tag
        cur = cur.__parent;
        if (hasContent) { // Insert content instead of current object
          if (cur[curName] instanceof Array) {
            const lastIdx = cur[curName].length-1;
            cur[curName][lastIdx] = xml.slice(curContent[0], curContent[1]);
          } else {
            cur[curName] = xml.slice(curContent[0], curContent[1]);
          }
        }
        while(xml[i] !== '>') {
          i++;
        }
        curName = '';
      } else if (xml[i+1] === '?' || xml[i+1] === '!') { // Ignore processing instructions, stylesheets, DTD validation, 
        if (xml[i+1] === '!') {
          // Handle declarations
          // TODO: Create skipUntil utility function
          if (xml.startsWith('<!DOCTYPE', i)) { // Doctype
            i+=9;
            while(xml[i] !== '>') {
              i++
            }
          } else if (xml.startsWith('<!--', i)) { // Comment
            i+= 4;
            while(!xml.startsWith('-->', i)) {
              i++;
            }
            i+= 2;
          } else if (xml.startsWith('<![CDATA[', i)) { // Handle CDATA
            i+= 9;
            let contentFrom = i;
            while(!xml.startsWith(']]>', i)) {
              i++;
            }
            let contentTo = i;
            curContent = [contentFrom, contentTo];
            i+=2;
            hasContent = true;
            continue; // Skip hasContent = false 
          }
        } else {
          // Ignore processing instructions and stylesheets
          while(xml[i] !== '>') {
            i++;
          }
        }
        
      } else { // Opening
        // Handle next
        i++; // Move to first char
        let name = ''; // Create a name
        while(xml[i] !== ' ' && xml[i] !== '>' && xml[i] !== '/') { // Go until attributes or closing. TODO: Handle XML attributes
          name += xml[i];
          i++
        }
        let isSelfClosing = false;
        while(xml[i] !== '>') { // Go until closing tag
          i++;
        }
        if (xml[i-1] === '/') {
          isSelfClosing = true;
        }
        if (cur[name]) { // Already defined, create an array or add to existing array
          if (!(cur[name] instanceof Array)) {
            cur[name] = [cur[name]];
          }
          const next: any = {}
          cur[name].push(next);
          next.__parent = cur;
          if (!isSelfClosing) {
            cur = next;
            curName = name;
          }
          
        } else { // Not defined yet. Create new property on json object
          cur[name] = {};
          cur[name].__parent = cur;
          if (!isSelfClosing) {
            cur = cur[name];
            curName = name;
          }
        }
      }
      hasContent = false;
    } else if (curName) { // Inside curName
      let contentFrom = i; // TODO: Handle mixed content
      while(xml[i] !== '<') {
        if(!hasContent && (xml[i] !== ' ' && xml[i] !== '\n')) {
          hasContent = true;
        }
        i++
      }
      let contentTo = i;
      i--
      curContent = [contentFrom, contentTo] // TODO: Trim spaces
    }
  }
  return o;
}
