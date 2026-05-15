export interface Station {
  stationuuid: string;
  name: string;
  url_resolved: string; // direct stream URL (might be HLS/MP3/AAC)
  url: string; // playlist URL (may need follow)
  country: string;
  countrycode: string;
  state?: string;
  language: string;
  tags: string; // comma-separated
  geo_lat: number;
  geo_long: number;
  votes: number;
  clickcount: number;
  bitrate: number;
  codec: string;
  favicon?: string;
  homepage?: string;
}

export interface StationDot {
  lat: number;
  lng: number;
  uuid: string;
  name: string;
  country: string;
  weight: number; // 0..1 popularity for sizing
}
