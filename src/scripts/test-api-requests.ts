async function test() {
  const loginUrl = 'http://localhost:3000/api/auth/login';
  const pendingUrl = 'http://localhost:3000/api/emergencies/pending';
  
  console.log('1. Testing Login API...');
  try {
    const loginRes = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'conductor@vita.com',
        password: 'password'
      })
    });
    
    console.log('Login Response Status:', loginRes.status);
    const loginData = await loginRes.json() as any;
    const token = loginData.token;
    console.log('Token extracted:', token ? 'YES' : 'NO');
    
    if (!token) {
      console.log('Login failed:', loginData);
      return;
    }
    
    console.log('\n2. Testing Pending Emergencies API...');
    const pendingRes = await fetch(pendingUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    console.log('Pending Response Status:', pendingRes.status);
    const pendingData = await pendingRes.json();
    console.log('Pending Response Body:', JSON.stringify(pendingData, null, 2));
  } catch (e: any) {
    console.error('Error:', e.message);
  }
}

test();
