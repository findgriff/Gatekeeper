import { FormEvent, useEffect, useRef, useState } from 'react';
import type { Person } from '@shared/types';

export function EnrollmentPage() {
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState<Person | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(undefined);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [form, setForm] = useState({
    person_id: '',
    full_name: '',
    company: '',
    address: '',
    phone: '',
    email: ''
  });

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    let stream: MediaStream;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      })
      .catch(() => undefined);
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function refresh(q?: string) {
    const list = await window.gatekeeper.listPeople(q);
    setPeople(list);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    await window.gatekeeper.savePerson({
      person_id: form.person_id || undefined,
      full_name: form.full_name,
      company: form.company,
      address: form.address,
      phone: form.phone,
      email: form.email,
      photoDataUrl
    });
    clearForm();
    refresh(query);
  }

  function clearForm() {
    setForm({ person_id: '', full_name: '', company: '', address: '', phone: '', email: '' });
    setSelected(null);
    setPhotoDataUrl(undefined);
  }

  function loadPerson(person: Person) {
    setSelected(person);
    setForm({
      person_id: person.person_id,
      full_name: person.full_name,
      company: person.company,
      address: person.address,
      phone: person.phone,
      email: person.email
    });
    if (person.photo_path) {
      window.gatekeeper.getPersonPhoto(person.photo_path).then((d) => setPhotoDataUrl(d ?? undefined));
    }
  }

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    setPhotoDataUrl(canvas.toDataURL('image/jpeg', 0.88));
  }

  return (
    <section className="page-grid two-col">
      <div className="panel">
        <div className="panel-title">Enroll / Edit Visitor</div>
        <form className="stack" onSubmit={submit}>
          <label>
            Full name
            <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
          </label>
          <label>
            Company
            <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} required />
          </label>
          <label>
            Address
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required />
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
          </label>
          <label>
            Email
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </label>

          <div className="photo-row">
            <video ref={videoRef} className="camera" muted playsInline />
            {photoDataUrl ? <img src={photoDataUrl} className="preview" alt="captured visitor" /> : <div className="preview" />}
          </div>
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div className="row">
            <button type="button" onClick={capturePhoto}>
              Capture Photo
            </button>
            <button type="submit">Save Visitor</button>
            <button type="button" className="ghost" onClick={clearForm}>
              Clear
            </button>
          </div>
        </form>
      </div>

      <div className="panel">
        <div className="panel-title">People Directory</div>
        <div className="row">
          <input
            placeholder="Search by name/company/phone/email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && refresh(query)}
          />
          <button onClick={() => refresh(query)}>Search</button>
        </div>
        <div className="list">
          {people.map((person) => (
            <button
              key={person.person_id}
              className={`list-item ${selected?.person_id === person.person_id ? 'active' : ''}`}
              onClick={() => loadPerson(person)}
            >
              <div>{person.full_name}</div>
              <small>{person.company}</small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
