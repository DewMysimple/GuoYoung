import {
  siAcademia,
  siBilibili,
  siDeepseek,
  siDouban,
  siDribbble,
  siFigma,
  siGithub,
  siGoogle,
  siGooglegemini,
  siKimi,
  siMdnwebdocs,
  siQq,
  siReact,
  siStackoverflow,
  siSubstack,
  siTiktok,
  siWikipedia,
  siX,
  siXiaohongshu,
  siYoutube,
  siZhihu,
  type SimpleIcon,
} from "simple-icons";

const iconsByDomain: Record<string, SimpleIcon> = {
  "google.com": siGoogle,
  "github.com": siGithub,
  "stackoverflow.com": siStackoverflow,
  "figma.com": siFigma,
  "dribbble.com": siDribbble,
  "bilibili.com": siBilibili,
  "youtube.com": siYoutube,
  "douban.com": siDouban,
  "douyin.com": siTiktok,
  "tiktok.com": siTiktok,
  "developer.mozilla.org": siMdnwebdocs,
  "wikipedia.org": siWikipedia,
  "kimi.com": siKimi,
  "deepseek.com": siDeepseek,
  "zhihu.com": siZhihu,
  "academia.edu": siAcademia,
  "gemini.google.com": siGooglegemini,
  "reactbits.dev": siReact,
  "substack.com": siSubstack,
  "x.com": siX,
  "xiaohongshu.com": siXiaohongshu,
  "mail.qq.com": siQq,
};

export function getBundledBrandIcon(url: string): SimpleIcon | undefined {
  const hostname = new URL(url).hostname.replace(/^www\./, "");
  const exact = iconsByDomain[hostname];
  if (exact) return exact;

  const parentDomain = Object.keys(iconsByDomain).find((domain) =>
    hostname.endsWith(`.${domain}`),
  );
  return parentDomain ? iconsByDomain[parentDomain] : undefined;
}
