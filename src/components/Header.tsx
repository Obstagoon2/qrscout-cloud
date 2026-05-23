import { Helmet } from 'react-helmet';
import { useQRScoutState } from '../store/store';

export function Header() {
  const page_title = useQRScoutState(state => state.formData.page_title);
  const faviconHref = `${import.meta.env.BASE_URL}favicon.ico`;
  return (
    <Helmet>
      <title>QRScout | {page_title}</title>
      <link rel="icon" href={faviconHref} />
    </Helmet>
  );
}
