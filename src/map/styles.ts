export interface MapStyleDef {
  id: string
  name: string
  url: string
}

// All OpenFreeMap styles share the same vector tiles — switching is free offline.
export const MAP_STYLES: MapStyleDef[] = [
  { id: 'dark', name: 'Dark', url: 'https://tiles.openfreemap.org/styles/dark' },
  { id: 'positron', name: 'Light', url: 'https://tiles.openfreemap.org/styles/positron' },
  { id: 'liberty', name: 'Streets', url: 'https://tiles.openfreemap.org/styles/liberty' },
  { id: 'bright', name: 'Bright', url: 'https://tiles.openfreemap.org/styles/bright' },
]

export function styleUrl(id: string): string {
  return (MAP_STYLES.find((s) => s.id === id) ?? MAP_STYLES[0]).url
}
