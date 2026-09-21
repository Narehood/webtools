import { lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./layout/Shell";
import { Home } from "./pages/Home";
import { Settings } from "./pages/Settings";
const BackgroundTool = lazy(() => import("./pages/tools/BackgroundTool").then((module) => ({ default: module.BackgroundTool })));
const CompressTool = lazy(() => import("./pages/tools/ConvertTool").then((module) => ({ default: module.CompressTool })));
const ConvertTool = lazy(() => import("./pages/tools/ConvertTool").then((module) => ({ default: module.ConvertTool })));
const DnsTool = lazy(() => import("./pages/tools/NetworkTools").then((module) => ({ default: module.DnsTool })));
const WhoisTool = lazy(() => import("./pages/tools/NetworkTools").then((module) => ({ default: module.WhoisTool })));
const StatusTool = lazy(() => import("./pages/tools/StatusTool").then((module) => ({ default: module.StatusTool })));
const ColorTool = lazy(() => import("./pages/tools/LocalTools").then((module) => ({ default: module.ColorTool })));
const JsonTool = lazy(() => import("./pages/tools/LocalTools").then((module) => ({ default: module.JsonTool })));
const QrTool = lazy(() => import("./pages/tools/LocalTools").then((module) => ({ default: module.QrTool })));
const Base64Tool = lazy(() => import("./pages/tools/CryptoTools").then((module) => ({ default: module.Base64Tool })));
const HashTool = lazy(() => import("./pages/tools/CryptoTools").then((module) => ({ default: module.HashTool })));
const PasswordTool = lazy(() => import("./pages/tools/CryptoTools").then((module) => ({ default: module.PasswordTool })));
const CaseTool = lazy(() => import("./pages/tools/TextTools").then((module) => ({ default: module.CaseTool })));
const DiffTool = lazy(() => import("./pages/tools/TextTools").then((module) => ({ default: module.DiffTool })));
const IdsTool = lazy(() => import("./pages/tools/TextTools").then((module) => ({ default: module.IdsTool })));
const TimestampTool = lazy(() => import("./pages/tools/TextTools").then((module) => ({ default: module.TimestampTool })));
const UrlTool = lazy(() => import("./pages/tools/TextTools").then((module) => ({ default: module.UrlTool })));
const CronTool = lazy(() => import("./pages/tools/DataTools").then((module) => ({ default: module.CronTool })));
const DataTool = lazy(() => import("./pages/tools/DataTools").then((module) => ({ default: module.DataTool })));
const RegexTool = lazy(() => import("./pages/tools/DataTools").then((module) => ({ default: module.RegexTool })));
const ExifTool = lazy(() => import("./pages/tools/ImagePlusTools").then((module) => ({ default: module.ExifTool })));
const ExifViewerTool = lazy(() => import("./pages/tools/ImagePlusTools").then((module) => ({ default: module.ExifViewerTool })));
const ResizeTool = lazy(() => import("./pages/tools/ImagePlusTools").then((module) => ({ default: module.ResizeTool })));
const HeadersTool = lazy(() => import("./pages/tools/NetworkPlusTools").then((module) => ({ default: module.HeadersTool })));
const MailTool = lazy(() => import("./pages/tools/NetworkPlusTools").then((module) => ({ default: module.MailTool })));
const SslTool = lazy(() => import("./pages/tools/NetworkPlusTools").then((module) => ({ default: module.SslTool })));
const ChecksumTool = lazy(() => import("./pages/tools/CryptoPlusTools").then((module) => ({ default: module.ChecksumTool })));
const JwtTool = lazy(() => import("./pages/tools/CryptoPlusTools").then((module) => ({ default: module.JwtTool })));
const EgressTool = lazy(() => import("./pages/tools/NetworkReachTools").then((module) => ({ default: module.EgressTool })));
const PortTool = lazy(() => import("./pages/tools/NetworkReachTools").then((module) => ({ default: module.PortTool })));
const PtrTool = lazy(() => import("./pages/tools/NetworkReachTools").then((module) => ({ default: module.PtrTool })));
const ChmodTool = lazy(() => import("./pages/tools/HomelabTools").then((module) => ({ default: module.ChmodTool })));
const CidrTool = lazy(() => import("./pages/tools/HomelabTools").then((module) => ({ default: module.CidrTool })));
const PemTool = lazy(() => import("./pages/tools/HomelabTools").then((module) => ({ default: module.PemTool })));
const TotpTool = lazy(() => import("./pages/tools/HomelabTools").then((module) => ({ default: module.TotpTool })));
const WifiQrTool = lazy(() => import("./pages/tools/HomelabTools").then((module) => ({ default: module.WifiQrTool })));
const UnitsTool = lazy(() => import("./pages/tools/UnitsTool").then((module) => ({ default: module.UnitsTool })));
const BillableHoursTool = lazy(() => import("./pages/tools/BillableHoursTool").then((module) => ({ default: module.BillableHoursTool })));
const CountTool = lazy(() => import("./pages/tools/ExtraTools").then((module) => ({ default: module.CountTool })));
const BasesTool = lazy(() => import("./pages/tools/ExtraTools").then((module) => ({ default: module.BasesTool })));
const EncodeTool = lazy(() => import("./pages/tools/ExtraTools").then((module) => ({ default: module.EncodeTool })));
const LoremTool = lazy(() => import("./pages/tools/ExtraTools").then((module) => ({ default: module.LoremTool })));
const LinesTool = lazy(() => import("./pages/tools/ExtraTools").then((module) => ({ default: module.LinesTool })));
const PercentTool = lazy(() => import("./pages/tools/ExtraTools").then((module) => ({ default: module.PercentTool })));
const AspectTool = lazy(() => import("./pages/tools/ExtraTools").then((module) => ({ default: module.AspectTool })));
const ZonesTool = lazy(() => import("./pages/tools/MoreTools").then((module) => ({ default: module.ZonesTool })));
const ColorConvertTool = lazy(() => import("./pages/tools/MoreTools").then((module) => ({ default: module.ColorConvertTool })));
const MarkdownTool = lazy(() => import("./pages/tools/MoreTools").then((module) => ({ default: module.MarkdownTool })));
const PassphraseTool = lazy(() => import("./pages/tools/MoreTools").then((module) => ({ default: module.PassphraseTool })));
const HmacTool = lazy(() => import("./pages/tools/MoreTools").then((module) => ({ default: module.HmacTool })));
const SiteFilesTool = lazy(() => import("./pages/tools/MoreTools").then((module) => ({ default: module.SiteFilesTool })));

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<Home />} />
          <Route path="/background" element={<BackgroundTool />} />
          <Route path="/convert" element={<ConvertTool />} />
          <Route path="/compress" element={<CompressTool />} />
          <Route path="/resize" element={<ResizeTool />} />
          <Route path="/exif-view" element={<ExifViewerTool />} />
          <Route path="/exif" element={<ExifTool />} />
          <Route path="/status" element={<StatusTool />} />
          <Route path="/ssl" element={<SslTool />} />
          <Route path="/whois" element={<WhoisTool />} />
          <Route path="/dns" element={<DnsTool />} />
          <Route path="/headers" element={<HeadersTool />} />
          <Route path="/mail" element={<MailTool />} />
          <Route path="/site-files" element={<SiteFilesTool />} />
          <Route path="/port" element={<PortTool />} />
          <Route path="/egress" element={<EgressTool />} />
          <Route path="/ptr" element={<PtrTool />} />
          <Route path="/cidr" element={<CidrTool />} />
          <Route path="/url" element={<UrlTool />} />
          <Route path="/diff" element={<DiffTool />} />
          <Route path="/json" element={<JsonTool />} />
          <Route path="/data" element={<DataTool />} />
          <Route path="/regex" element={<RegexTool />} />
          <Route path="/case" element={<CaseTool />} />
          <Route path="/ids" element={<IdsTool />} />
          <Route path="/timestamp" element={<TimestampTool />} />
          <Route path="/cron" element={<CronTool />} />
          <Route path="/qr" element={<QrTool />} />
          <Route path="/wifi" element={<WifiQrTool />} />
          <Route path="/chmod" element={<ChmodTool />} />
          <Route path="/units" element={<UnitsTool />} />
          <Route path="/billable-hours" element={<BillableHoursTool />} />
          <Route path="/color" element={<ColorTool />} />
          <Route path="/count" element={<CountTool />} />
          <Route path="/bases" element={<BasesTool />} />
          <Route path="/encode" element={<EncodeTool />} />
          <Route path="/lorem" element={<LoremTool />} />
          <Route path="/lines" element={<LinesTool />} />
          <Route path="/percent" element={<PercentTool />} />
          <Route path="/aspect" element={<AspectTool />} />
          <Route path="/zones" element={<ZonesTool />} />
          <Route path="/color-convert" element={<ColorConvertTool />} />
          <Route path="/markdown" element={<MarkdownTool />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/hash" element={<HashTool />} />
          <Route path="/checksum" element={<ChecksumTool />} />
          <Route path="/jwt" element={<JwtTool />} />
          <Route path="/base64" element={<Base64Tool />} />
          <Route path="/password" element={<PasswordTool />} />
          <Route path="/passphrase" element={<PassphraseTool />} />
          <Route path="/hmac" element={<HmacTool />} />
          <Route path="/totp" element={<TotpTool />} />
          <Route path="/pem" element={<PemTool />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
