import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { ToastViewport } from '@/components/ui/Toast';

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <ToastViewport />
    </>
  );
}
