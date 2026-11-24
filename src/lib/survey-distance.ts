import type { MobilePoint as Point } from "@/types/mobile-surveys";
// Vincenty inverse on WGS84, with a spherical fallback for near-antipodal pairs.
export function distance(a: Point, b: Point) {
  const rad = Math.PI / 180, major = 6378137, f = 1 / 298.257223563, minor = (1-f)*major;
  const u1=Math.atan((1-f)*Math.tan(a.latitude*rad)), u2=Math.atan((1-f)*Math.tan(b.latitude*rad));
  const s1=Math.sin(u1),c1=Math.cos(u1),s2=Math.sin(u2),c2=Math.cos(u2),L=(b.longitude-a.longitude)*rad;
  let lambda=L, sigma=0, sinSigma=0, cosSigma=0, cos2Alpha=0, cos2Middle=0;
  for(let i=0;i<100;i++) {
    const sl=Math.sin(lambda), cl=Math.cos(lambda);
    sinSigma=Math.hypot(c2*sl,c1*s2-s1*c2*cl);
    if(sinSigma===0)return 0;
    cosSigma=s1*s2+c1*c2*cl; sigma=Math.atan2(sinSigma,cosSigma);
    const sinAlpha=c1*c2*sl/sinSigma; cos2Alpha=1-sinAlpha*sinAlpha;
    cos2Middle=cos2Alpha===0?0:cosSigma-2*s1*s2/cos2Alpha;
    const C=f/16*cos2Alpha*(4+f*(4-3*cos2Alpha)), old=lambda;
    lambda=L+(1-C)*f*sinAlpha*(sigma+C*sinSigma*(cos2Middle+C*cosSigma*(-1+2*cos2Middle*cos2Middle)));
    if(Math.abs(lambda-old)<1e-12) {
      const u=cos2Alpha*(major*major-minor*minor)/(minor*minor), A=1+u/16384*(4096+u*(-768+u*(320-175*u))),B=u/1024*(256+u*(-128+u*(74-47*u)));
      return minor*A*(sigma-B*sinSigma*(cos2Middle+B/4*(cosSigma*(-1+2*cos2Middle**2)-B/6*cos2Middle*(-3+4*sinSigma**2)*(-3+4*cos2Middle**2))));
    }
  }
  const h=Math.sin((b.latitude-a.latitude)*rad/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(L/2)**2;
  return 6371008.8*2*Math.asin(Math.sqrt(Math.min(1,h)));
}
