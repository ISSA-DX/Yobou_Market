// Camera icon for search bars: opens the photo sheet, starts the search
// and goes to the results page (/search/photo).
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Icon from './Icon';
import PhotoSearchSheet from './PhotoSearchSheet';
import { startPhotoSearch } from '../lib/photoSearch';

export default function CameraSearchButton({ className = '', iconClassName = 'text-[22px]' }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  function onPick(file) {
    startPhotoSearch(file);
    if (pathname !== '/search/photo') navigate('/search/photo');
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} aria-label="Search with a photo" title="Search with a photo">
        <Icon name="photo_camera" className={iconClassName} />
      </button>
      <PhotoSearchSheet open={open} onClose={() => setOpen(false)} onPick={onPick} />
    </>
  );
}
