import api from '../api';

export async function getMyProfile() {
  const response = await api.get('/api/profile');
  return response.data.data;
}

export async function updateMyProfile(payload) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.patch('/api/profile', payload);
  return response.data.data;
}

export async function changeMyPassword(currentPassword, password, passwordConfirmation) {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.post('/api/profile/change-password', {
    current_password: currentPassword,
    password,
    password_confirmation: passwordConfirmation,
  });
  return response.data;
}

export async function uploadMyAvatar(file) {
  await api.get('/sanctum/csrf-cookie');
  const formData = new FormData();
  formData.append('avatar', file);
  const response = await api.post('/api/profile/avatar', formData);
  return response.data.data;
}

export async function removeMyAvatar() {
  await api.get('/sanctum/csrf-cookie');
  const response = await api.delete('/api/profile/avatar');
  return response.data.data;
}
