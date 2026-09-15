import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./layout/Shell";
import { Home } from "./pages/Home";
import { BackgroundTool } from "./pages/tools/BackgroundTool";
import { CompressTool, ConvertTool } from "./pages/tools/ConvertTool";
import { DnsTool, WhoisTool } from "./pages/tools/NetworkTools";
import { StatusTool } from "./pages/tools/StatusTool";
import { ColorTool, JsonTool, QrTool } from "./pages/tools/LocalTools";
import { Base64Tool, HashTool, PasswordTool } from "./pages/tools/CryptoTools";
import { CaseTool, DiffTool, IdsTool, TimestampTool, UrlTool } from "./pages/tools/TextTools";
import { CronTool, DataTool, RegexTool } from "./pages/tools/DataTools";
import { ExifTool, ExifViewerTool, ResizeTool } from "./pages/tools/ImagePlusTools";
import { HeadersTool, MailTool, SslTool } from "./pages/tools/NetworkPlusTools";
import { ChecksumTool, JwtTool } from "./pages/tools/CryptoPlusTools";

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
          <Route path="/color" element={<ColorTool />} />
          <Route path="/hash" element={<HashTool />} />
          <Route path="/checksum" element={<ChecksumTool />} />
          <Route path="/jwt" element={<JwtTool />} />
          <Route path="/base64" element={<Base64Tool />} />
          <Route path="/password" element={<PasswordTool />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
