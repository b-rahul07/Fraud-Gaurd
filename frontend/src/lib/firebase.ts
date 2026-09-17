export const auth = {
  onAuthStateChanged: (cb: any) => { cb({ uid: '123' }); return () => {}; }
} as any;
export const db = {} as any;
