import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, getDocs, onSnapshot, doc, deleteDoc, updateDoc, query, where } from 'firebase/firestore';

// Global variables provided by the Canvas environment.
// These are directly available in the browser environment where the app runs.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;


// Main App Component
const App = () => {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [properties, setProperties] = useState([]);
    const [filteredProperties, setFilteredProperties] = useState([]);
    const [customers, setCustomers] = useState([]); // New state for customers
    const [appointments, setAppointments] = useState([]); // New state for appointments
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [propertyInput, setPropertyInput] = useState('');
    const [customerNeedsInput, setCustomerNeedsInput] = useState(''); // New input for customer needs AI
    const [searchQuery, setSearchQuery] = useState('');
    const [excelFile, setExcelFile] = useState(null); // New state for Excel file

    const [form, setForm] = useState({ // Property form
        id: null,
        maBatDongSan: '',
        chinhCau: '', // Chính chủ (đã sửa lỗi chính tả từ chinhChu sang chinhCau nếu có)
        khachQuanTam: '',
        nguoiTao: '',
        nguoiPhuTrach: '',
        daXemBoih: '',
        title: '',
        location: '',
        latitude: '', // New field for property location
        longitude: '', // New field for property location
        imageLink: '', // New field for image link
        videoLink: '', // New field for video link
        area: '',
        price: '',
        bedrooms: '',
        bathrooms: '',
        contact: '',
        description: '',
        loaiNhaDat: '',
        loaiGiaoDich: '',
        loaiHinhBatDongSan: '',
        nguonHang: '',
        loaiHinhKhac: '',
        loaiHinhKinhDoanh: '',
        duAn: '',
        bangHang: '',
        giaiDoan: '',
        khu: '',
        soTo: '',
        soThua: '',
        toaDoVN2000: '',
        donGiaDat: '',
        tongGiaDat: '',
        vatPhanTram: '',
        phiBaoTri: '',
        chiPhiKhac: '',
        tongGiaTriHopDong: '',
        giaChot: '',
        hoaHongPhanTram: '',
        tienHoaHong: '',
        dienTichXayDung: '',
        matTien: '',
        chieuSau: '',
        matSau: '',
        duongRong: '',
        huongCua: '',
        loaiCan: '',
        soTang: '',
        viTriTang: '',
        chiPhiNoiThat: '',
        danhGiaBDS: '',
        danhGiaVeGia: '',
        thongTinBoSung: '',
        dacDiemNoiTroi: '',
        taiLieuPhapLy: '',
        ngayBanGiao: '',
        nhuocDiem: '',
        tags: '',
        nguonTin: '',
        ngayNhan: '',
    });

    const [customerForm, setCustomerForm] = useState({ // New state for customer form
        id: null,
        name: '',
        phone: '',
        email: '',
        zaloLink: '',
        facebookLink: '',
        needs: '', // Customer needs description
        notes: '',
    });

    const [appointmentForm, setAppointmentForm] = useState({ // New state for appointment form
        id: null,
        customerId: '', // Link to customer ID
        propertyId: '', // Link to property ID (optional)
        date: '',
        time: '',
        purpose: '',
        notes: '',
    });


    const messageTimeoutRef = useRef(null);

    // Initialize Firebase and set up authentication listener
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const firestoreDb = getFirestore(app);
            const firebaseAuth = getAuth(app);

            setDb(firestoreDb);
            setAuth(firebaseAuth);

            const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    // Sign in anonymously if no custom token is provided
                    // This is crucial for Canvas environment where __initial_auth_token might not always be present
                    if (!initialAuthToken) {
                        await signInAnonymously(firebaseAuth);
                    }
                }
                setIsAuthReady(true); // Auth state is ready
            });

            // Clean up the listener on component unmount
            return () => unsubscribe();
        } catch (error) {
            console.error("Lỗi khởi tạo Firebase:", error);
            showMessage("Lỗi: Không thể khởi tạo Firebase.");
        }
    }, []);

    // Sign in with custom token if available
    useEffect(() => {
        const signIn = async () => {
            if (auth && initialAuthToken && !userId) {
                try {
                    await signInWithCustomToken(auth, initialAuthToken);
                } catch (error) {
                    console.error("Lỗi đăng nhập với token tùy chỉnh:", error);
                    showMessage("Lỗi: Không thể đăng nhập với token tùy chỉnh.");
                    // Fallback to anonymous if custom token fails
                    try {
                        await signInAnonymously(auth);
                    } catch (anonError) {
                        console.error("Lỗi đăng nhập ẩn danh:", anonError);
                        showMessage("Lỗi: Không thể đăng nhập ẩn danh.");
                    }
                }
            }
        };
        // Only try to sign in if auth is ready and no user is set yet
        // and if initialAuthToken is actually provided (not null from fallback)
        if (auth && !userId && initialAuthToken) {
            signIn();
        } else if (auth && !userId && !initialAuthToken && isAuthReady) {
            // If no initial token and auth is ready, ensure anonymous sign-in
            signInAnonymously(auth).catch(anonError => {
                console.error("Lỗi đăng nhập ẩn danh (fallback):", anonError);
                showMessage("Lỗi: Không thể đăng nhập ẩn danh.");
            });
        }
    }, [auth, initialAuthToken, userId, isAuthReady]);


    // Fetch properties when auth is ready and userId is available
    useEffect(() => {
        if (db && userId && isAuthReady) {
            const propertiesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/properties`);
            const unsubscribe = onSnapshot(propertiesCollectionRef, (snapshot) => {
                const fetchedProperties = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setProperties(fetchedProperties);
                setFilteredProperties(fetchedProperties); // Initialize filtered properties
            }, (error) => {
                console.error("Lỗi khi lấy dữ liệu bất động sản:", error);
                showMessage("Lỗi: Không thể tải dữ liệu bất động sản.");
            });

            return () => unsubscribe();
        }
    }, [db, userId, isAuthReady]);

    // Fetch customers when auth is ready and userId is available
    useEffect(() => {
        if (db && userId && isAuthReady) {
            const customersCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/customers`);
            const unsubscribe = onSnapshot(customersCollectionRef, (snapshot) => {
                const fetchedCustomers = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setCustomers(fetchedCustomers);
            }, (error) => {
                console.error("Lỗi khi lấy dữ liệu khách hàng:", error);
                showMessage("Lỗi: Không thể tải dữ liệu khách hàng.");
            });

            return () => unsubscribe();
        }
    }, [db, userId, isAuthReady]);

    // Fetch appointments when auth is ready and userId is available
    useEffect(() => {
        if (db && userId && isAuthReady) {
            const appointmentsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/appointments`);
            const unsubscribe = onSnapshot(appointmentsCollectionRef, (snapshot) => {
                const fetchedAppointments = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setAppointments(fetchedAppointments);
            }, (error) => {
                console.error("Lỗi khi lấy dữ liệu lịch hẹn:", error);
                showMessage("Lỗi: Không thể tải dữ liệu lịch hẹn.");
            });

            return () => unsubscribe();
        }
    }, [db, userId, isAuthReady]);


    // Function to display messages to the user
    const showMessage = (msg, type = 'info') => {
        setMessage(msg);
        if (messageTimeoutRef.current) {
            clearTimeout(messageTimeoutRef.current);
        }
        messageTimeoutRef.current = setTimeout(() => {
            setMessage('');
        }, 5000); // Message disappears after 5 seconds
    };

    // Handle property form input changes
    const handlePropertyChange = (e) => {
        const { name, value } = e.target;
        setForm({ ...form, [name]: value });
    };

    // Handle customer form input changes
    const handleCustomerChange = (e) => {
        const { name, value } = e.target;
        setCustomerForm({ ...customerForm, [name]: value });
    };

    // Handle appointment form input changes
    const handleAppointmentChange = (e) => {
        const { name, value } = e.target;
        setAppointmentForm({ ...appointmentForm, [name]: value });
    };

    // Clear property form
    const clearPropertyForm = () => {
        setForm({
            id: null,
            maBatDongSan: '',
            chinhCau: '',
            khachQuanTam: '',
            nguoiTao: '',
            nguoiPhuTrach: '',
            daXemBoih: '',
            title: '',
            location: '',
            latitude: '',
            longitude: '',
            imageLink: '',
            videoLink: '',
            area: '',
            price: '',
            bedrooms: '',
            bathrooms: '',
            contact: '',
            description: '',
            loaiNhaDat: '',
            loaiGiaoDich: '',
            loaiHinhBatDongSan: '',
            nguonHang: '',
            loaiHinhKhac: '',
            loaiHinhKinhDoanh: '',
            duAn: '',
            bangHang: '',
            giaiDoan: '',
            khu: '',
            soTo: '',
            soThua: '',
            toaDoVN2000: '',
            donGiaDat: '',
            tongGiaDat: '',
            vatPhanTram: '',
            phiBaoTri: '',
            chiPhiKhac: '',
            tongGiaTriHopDong: '',
            giaChot: '',
            hoaHongPhanTram: '',
            tienHoaHong: '',
            dienTichXayDung: '',
            matTien: '',
            chieuSau: '',
            matSau: '',
            duongRong: '',
            huongCua: '',
            loaiCan: '',
            soTang: '',
            viTriTang: '',
            chiPhiNoiThat: '',
            danhGiaBDS: '',
            danhGiaVeGia: '',
            thongTinBoSung: '',
            dacDiemNoiTroi: '',
            taiLieuPhapLy: '',
            ngayBanGiao: '',
            nhuocDiem: '',
            tags: '',
            nguonTin: '',
            ngayNhan: '',
        });
        setPropertyInput('');
    };

    // Clear customer form
    const clearCustomerForm = () => {
        setCustomerForm({
            id: null,
            name: '',
            phone: '',
            email: '',
            zaloLink: '',
            facebookLink: '',
            needs: '',
            notes: '',
        });
        setCustomerNeedsInput('');
    };

    // Clear appointment form
    const clearAppointmentForm = () => {
        setAppointmentForm({
            id: null,
            customerId: '',
            propertyId: '',
            date: '',
            time: '',
            purpose: '',
            notes: '',
        });
    };

    // Generate a short unique ID for maBatDongSan
    const generateMaBatDongSan = () => {
        const prefix = "BDS-";
        const randomString = Math.random().toString(36).substring(2, 8).toUpperCase(); // 6 random alphanumeric chars
        return prefix + randomString;
    };

    // Save or update property
    const handlePropertySubmit = async (e) => {
        e.preventDefault();
        if (!db || !userId) {
            showMessage("Lỗi: Chưa đăng nhập hoặc Firebase chưa sẵn sàng.", "error");
            return;
        }
        setLoading(true);
        try {
            if (form.id) {
                // Update existing property
                const propertyDocRef = doc(db, `artifacts/${appId}/users/${userId}/properties`, form.id);
                await updateDoc(propertyDocRef, { ...form, id: undefined }); // Remove id from data
                showMessage("Cập nhật bất động sản thành công!");
            } else {
                // Add new property
                const newMaBatDongSan = generateMaBatDongSan();
                const propertiesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/properties`);
                await addDoc(propertiesCollectionRef, { ...form, maBatDongSan: newMaBatDongSan });
                showMessage("Thêm bất động sản thành công!");
            }
            clearPropertyForm();
        } catch (error) {
            console.error("Lỗi khi lưu bất động sản:", error);
            showMessage("Lỗi: Không thể lưu bất động sản.", "error");
        } finally {
            setLoading(false);
        }
    };

    // Edit property (load into form)
    const handleEditProperty = (property) => {
        setForm(property);
        setPropertyInput(property.description); // Load description into input for re-analysis if needed
        showMessage("Đã tải thông tin bất động sản vào biểu mẫu để chỉnh sửa.");
    };

    // Delete property
    const handleDeleteProperty = async (id) => {
        if (!db || !userId) {
            showMessage("Lỗi: Chưa đăng nhập hoặc Firebase chưa sẵn sàng.", "error");
            return;
        }
        setLoading(true);
        try {
            const propertyDocRef = doc(db, `artifacts/${appId}/users/${userId}/properties`, id);
            await deleteDoc(propertyDocRef);
            showMessage("Xóa bất động sản thành công!");
        } catch (error) {
            console.error("Lỗi khi xóa bất động sản:", error);
            showMessage("Lỗi: Không thể xóa bất động sản.", "error");
        } finally {
            setLoading(false);
        }
    };

    // Save or update customer
    const handleCustomerSubmit = async (e) => {
        e.preventDefault();
        if (!db || !userId) {
            showMessage("Lỗi: Chưa đăng nhập hoặc Firebase chưa sẵn sàng.", "error");
            return;
        }
        setLoading(true);
        try {
            if (customerForm.id) {
                const customerDocRef = doc(db, `artifacts/${appId}/users/${userId}/customers`, customerForm.id);
                await updateDoc(customerDocRef, { ...customerForm, id: undefined });
                showMessage("Cập nhật khách hàng thành công!");
            } else {
                const customersCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/customers`);
                await addDoc(customersCollectionRef, customerForm);
                showMessage("Thêm khách hàng thành công!");
            }
            clearCustomerForm();
        } catch (error) {
            console.error("Lỗi khi lưu khách hàng:", error);
            showMessage("Lỗi: Không thể lưu khách hàng.", "error");
        } finally {
            setLoading(false);
        }
    };

    // Edit customer
    const handleEditCustomer = (customer) => {
        setCustomerForm(customer);
        setCustomerNeedsInput(customer.needs); // Load needs into input for re-analysis
        showMessage("Đã tải thông tin khách hàng vào biểu mẫu để chỉnh sửa.");
    };

    // Delete customer
    const handleDeleteCustomer = async (id) => {
        if (!db || !userId) {
            showMessage("Lỗi: Chưa đăng nhập hoặc Firebase chưa sẵn sàng.", "error");
            return;
        }
        setLoading(true);
        try {
            const customerDocRef = doc(db, `artifacts/${appId}/users/${userId}/customers`, id);
            await deleteDoc(customerDocRef);
            showMessage("Xóa khách hàng thành công!");
        } catch (error) {
            console.error("Lỗi khi xóa khách hàng:", error);
            showMessage("Lỗi: Không thể xóa khách hàng.", "error");
        } finally {
            setLoading(false);
        }
    };

    // Save or update appointment
    const handleAppointmentSubmit = async (e) => {
        e.preventDefault();
        if (!db || !userId) {
            showMessage("Lỗi: Chưa đăng nhập hoặc Firebase chưa sẵn sàng.", "error");
            return;
        }
        setLoading(true);
        try {
            if (appointmentForm.id) {
                const appointmentDocRef = doc(db, `artifacts/${appId}/users/${userId}/appointments`, appointmentForm.id);
                await updateDoc(appointmentDocRef, { ...appointmentForm, id: undefined });
                showMessage("Cập nhật lịch hẹn thành công!");
            } else {
                const appointmentsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/appointments`);
                await addDoc(appointmentsCollectionRef, appointmentForm);
                showMessage("Thêm lịch hẹn thành công!");
            }
            clearAppointmentForm();
        } catch (error) {
            console.error("Lỗi khi lưu lịch hẹn:", error);
            showMessage("Lỗi: Không thể lưu lịch hẹn.", "error");
        } finally {
            setLoading(false);
        }
    };

    // Edit appointment
    const handleEditAppointment = (appointment) => {
        setAppointmentForm(appointment);
        showMessage("Đã tải thông tin lịch hẹn vào biểu mẫu để chỉnh sửa.");
    };

    // Delete appointment
    const handleDeleteAppointment = async (id) => {
        if (!db || !userId) {
            showMessage("Lỗi: Chưa đăng nhập hoặc Firebase chưa sẵn sàng.", "error");
            return;
        }
        setLoading(true);
        try {
            const appointmentDocRef = doc(db, `artifacts/${appId}/users/${userId}/appointments`, id);
            await deleteDoc(appointmentDocRef);
            showMessage("Xóa lịch hẹn thành công!");
        } catch (error) {
                console.error("Lỗi khi xóa lịch hẹn:", error);
                showMessage("Lỗi: Không thể xóa lịch hẹn.", "error");
        } finally {
            setLoading(false);
        }
    };


    // AI-powered data entry for Property
    const analyzePropertyText = async () => {
        if (!propertyInput.trim()) {
            showMessage("Vui lòng nhập mô tả bất động sản để phân tích.", "warning");
            return;
        }
        setLoading(true);
        setMessage("Đang phân tích mô tả bất động sản bằng AI...");

        const prompt = `Bạn là một trợ lý phân tích thông tin bất động sản. Hãy phân tích đoạn văn bản sau và trích xuất các thông tin sau vào định dạng JSON: "chinhCau", "title", "location", "latitude", "longitude", "imageLink", "videoLink", "area", "price", "bedrooms", "bathrooms", "contact", "loaiNhaDat", "loaiGiaoDich", "loaiHinhBatDongSan", "nguonHang", "loaiHinhKhac", "duAn", "soTo", "soThua", "donGiaDat", "tongGiaDat", "matTien", "chieuSau", "matSau", "duongRong", "huongCua", "loaiCan", "soTang", "viTriTang", "danhGiaBDS", "danhGiaVeGia", "dacDiemNoiTroi", "taiLieuPhapLy", "nhuocDiem", "tags", "dienTichXayDung". Nếu không có thông tin cụ thể, hãy để trống hoặc điền "N/A".
        Văn bản: ${propertyInput}`;

        try {
            const payload = {
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            "chinhCau": { "type": "STRING" },
                            "title": { "type": "STRING" },
                            "location": { "type": "STRING" },
                            "latitude": { "type": "STRING" },
                            "longitude": { "type": "STRING" },
                            "imageLink": { "type": "STRING" },
                            "videoLink": { "type": "STRING" },
                            "area": { "type": "STRING" },
                            "price": { "type": "STRING" },
                            "bedrooms": { "type": "STRING" },
                            "bathrooms": { "type": "STRING" },
                            "contact": { "type": "STRING" },
                            "loaiNhaDat": { "type": "STRING" },
                            "loaiGiaoDich": { "type": "STRING" },
                            "loaiHinhBatDongSan": { "type": "STRING" },
                            "nguonHang": { "type": "STRING" },
                            "loaiHinhKhac": { "type": "STRING" },
                            "duAn": { "type": "STRING" },
                            "soTo": { "type": "STRING" },
                            "soThua": { "type": "STRING" },
                            "donGiaDat": { "type": "STRING" },
                            "tongGiaDat": { "type": "STRING" },
                            "matTien": { "type": "STRING" },
                            "chieuSau": { "type": "STRING" },
                            "matSau": { "type": "STRING" },
                            "duongRong": { "type": "STRING" },
                            "huongCua": { "type": "STRING" },
                            "loaiCan": { "type": "STRING" },
                            "soTang": { "type": "STRING" },
                            "viTriTang": { "type": "STRING" },
                            "danhGiaBDS": { "type": "STRING" },
                            "danhGiaVeGia": { "type": "STRING" },
                            "dacDiemNoiTroi": { "type": "STRING" },
                            "taiLieuPhapLy": { "type": "STRING" },
                            "nhuocDiem": { "type": "STRING" },
                            "tags": { "type": "STRING" },
                            "dienTichXayDung": { "type": "STRING" }
                        },
                        "propertyOrdering": [
                            "chinhCau", "title", "location", "latitude", "longitude", "imageLink", "videoLink", "area", "price", "bedrooms", "bathrooms", "contact",
                            "loaiNhaDat", "loaiGiaoDich", "loaiHinhBatDongSan", "nguonHang", "loaiHinhKhac", "duAn", "soTo", "soThua", "donGiaDat", "tongGiaDat",
                            "matTien", "chieuSau", "matSau", "duongRong", "huongCua", "loaiCan", "soTang", "viTriTang",
                            "danhGiaBDS", "danhGiaVeGia", "dacDiemNoiTroi", "taiLieuPhapLy", "nhuocDiem", "tags", "dienTichXayDung"
                        ]
                    }
                }
            };

            const apiKey = ""; // Canvas will provide this
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                const jsonText = result.candidates[0].content.parts[0].text;
                const parsedData = JSON.parse(jsonText);

                setForm(prevForm => ({
                    ...prevForm,
                    chinhCau: parsedData.chinhCau || '',
                    title: parsedData.title || '',
                    location: parsedData.location || '',
                    latitude: parsedData.latitude || '',
                    longitude: parsedData.longitude || '',
                    imageLink: parsedData.imageLink || '',
                    videoLink: parsedData.videoLink || '',
                    area: parsedData.area || '',
                    price: parsedData.price || '',
                    bedrooms: parsedData.bedrooms || '',
                    bathrooms: parsedData.bathrooms || '',
                    contact: parsedData.contact || '',
                    description: propertyInput, // Always keep the original input for description
                    loaiNhaDat: parsedData.loaiNhaDat || '',
                    loaiGiaoDich: parsedData.loaiGiaoDich || '',
                    loaiHinhBatDongSan: parsedData.loaiHinhBatDongSan || '',
                    nguonHang: parsedData.nguonHang || '',
                    loaiHinhKhac: parsedData.loaiHinhKhac || '',
                    duAn: parsedData.duAn || '',
                    soTo: parsedData.soTo || '',
                    soThua: parsedData.soThua || '',
                    donGiaDat: parsedData.donGiaDat || '',
                    tongGiaDat: parsedData.tongGiaDat || parsedData.price || '',
                    matTien: parsedData.matTien || '',
                    chieuSau: parsedData.chieuSau || '',
                    matSau: parsedData.matSau || '',
                    duongRong: parsedData.duongRong || '',
                    huongCua: parsedData.huongCua || '',
                    loaiCan: parsedData.loaiCan || '',
                    soTang: parsedData.soTang || '',
                    viTriTang: parsedData.viTriTang || '',
                    chiPhiNoiThat: parsedData.chiPhiNoiThat || '',
                    danhGiaBDS: parsedData.danhGiaBDS || '',
                    danhGiaVeGia: parsedData.danhGiaVeGia || '',
                    dacDiemNoiTroi: parsedData.dacDiemNoiTroi || '',
                    taiLieuPhapLy: parsedData.taiLieuPhapLy || '',
                    ngayBanGiao: parsedData.ngayBanGiao || '',
                    nhuocDiem: parsedData.nhuocDiem || '',
                    tags: parsedData.tags || '',
                    dienTichXayDung: parsedData.dienTienXayDung || '',
                }));
                showMessage("Phân tích AI hoàn tất. Vui lòng kiểm tra và chỉnh sửa nếu cần.");
            } else {
                showMessage("Lỗi: AI không thể phân tích thông tin từ văn bản.", "error");
                console.error("AI response structure unexpected:", result);
            }
        } catch (error) {
            console.error("Lỗi gọi API Gemini:", error);
            showMessage("Lỗi: Không thể kết nối với AI để phân tích.", "error");
        } finally {
            setLoading(false);
        }
    };

    // AI-powered data entry for Customer Needs
    const analyzeCustomerNeeds = async () => {
        if (!customerNeedsInput.trim()) {
            showMessage("Vui lòng nhập mô tả nhu cầu khách hàng để phân tích.", "warning");
            return;
        }
        setLoading(true);
        setMessage("Đang phân tích nhu cầu khách hàng bằng AI...");

        const prompt = `Bạn là một trợ lý phân tích nhu cầu khách hàng về bất động sản. Hãy phân tích đoạn văn bản sau và trích xuất các thông tin sau vào định dạng JSON: "loaiGiaoDich" (mua bán/cho thuê), "loaiHinhBatDongSan" (nhà/đất nền/căn hộ), "location" (vị trí mong muốn), "minPrice" (giá tối thiểu), "maxPrice" (giá tối đa), "minBedrooms" (số phòng ngủ tối thiểu), "maxBedrooms" (số phòng ngủ tối đa), "areaKeyword" (từ khóa diện tích như nhỏ, lớn, rộng), "huongCua" (hướng mong muốn). Nếu không có thông tin cụ thể, hãy để trống hoặc điền "N/A".
        Văn bản: ${customerNeedsInput}`;

        try {
            const payload = {
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            "loaiGiaoDich": { "type": "STRING" },
                            "loaiHinhBatDongSan": { "type": "STRING" },
                            "location": { "type": "STRING" },
                            "minPrice": { "type": "STRING" },
                            "maxPrice": { "type": "STRING" },
                            "minBedrooms": { "type": "STRING" },
                            "maxBedrooms": { "type": "STRING" },
                            "areaKeyword": { "type": "STRING" },
                            "huongCua": { "type": "STRING" }
                        }
                    }
                }
            };

            const apiKey = ""; // Canvas will provide this
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                const jsonText = result.candidates[0].content.parts[0].text;
                const parsedData = JSON.parse(jsonText);

                // Format the parsed data into a readable string for the 'needs' field
                let formattedNeeds = `Nhu cầu: `;
                if (parsedData.loaiGiaoDich && parsedData.loaiGiaoDich !== "N/A") formattedNeeds += `GD: ${parsedData.loaiGiaoDich}. `;
                if (parsedData.loaiHinhBatDongSan && parsedData.loaiHinhBatDongSan !== "N/A") formattedNeeds += `Loại: ${parsedData.loaiHinhBatDongSan}. `;
                if (parsedData.location && parsedData.location !== "N/A") formattedNeeds += `Vị trí: ${parsedData.location}. `;
                if (parsedData.minPrice && parsedData.minPrice !== "N/A") formattedNeeds += `Giá từ: ${parsedData.minPrice}. `;
                if (parsedData.maxPrice && parsedData.maxPrice !== "N/A") formattedNeeds += `Giá đến: ${parsedData.maxPrice}. `;
                if (parsedData.minBedrooms && parsedData.minBedrooms !== "N/A") formattedNeeds += `PN từ: ${parsedData.minBedrooms}. `;
                if (parsedData.maxBedrooms && parsedData.maxBedrooms !== "N/A") formattedNeeds += `PN đến: ${parsedData.maxBedrooms}. `;
                if (parsedData.areaKeyword && parsedData.areaKeyword !== "N/A") formattedNeeds += `DT: ${parsedData.areaKeyword}. `;
                if (parsedData.huongCua && parsedData.huongCua !== "N/A") formattedNeeds += `Hướng: ${parsedData.huongCua}. `;

                setCustomerForm(prevForm => ({
                    ...prevForm,
                    needs: formattedNeeds.trim(),
                }));
                showMessage("Phân tích nhu cầu AI hoàn tất. Vui lòng kiểm tra và chỉnh sửa nếu cần.");
            } else {
                showMessage("Lỗi: AI không thể phân tích nhu cầu từ văn bản.", "error");
                console.error("AI response structure unexpected:", result);
            }
        } catch (error) {
            console.error("Lỗi gọi API Gemini cho phân tích nhu cầu:", error);
            showMessage("Lỗi: Không thể kết nối với AI để phân tích nhu cầu.", "error");
        } finally {
            setLoading(false);
        }
    };


    // AI-powered search for Properties
    const handleAISearch = async () => {
        if (!searchQuery.trim()) {
            setFilteredProperties(properties); // Show all if search query is empty
            showMessage("Vui lòng nhập từ khóa tìm kiếm.");
            return;
        }
        setLoading(true);
        setMessage("Đang tìm kiếm bằng AI...");

        // Updated prompt for search to include new fields
        const prompt = `Bạn là một trợ lý tìm kiếm bất động sản. Dựa trên yêu cầu tìm kiếm sau, hãy gợi ý các tiêu chí lọc (ví dụ: 'location', 'minPrice', 'maxPrice', 'minBedrooms', 'maxBedrooms', 'areaKeyword', 'huongCua', 'loaiNhaDat', 'loaiGiaoDich', 'loaiHinhBatDongSan', 'duAn') dưới dạng JSON. 'areaKeyword' có thể là 'nhỏ', 'lớn', 'rộng'. Nếu không có tiêu chí nào rõ ràng, hãy trả về JSON rỗng.
        Yêu cầu: ${searchQuery}`;

        try {
            const payload = {
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            "location": { "type": "STRING" },
                            "minPrice": { "type": "STRING" },
                            "maxPrice": { "type": "STRING" },
                            "minBedrooms": { "type": "STRING" },
                            "maxBedrooms": { "type": "STRING" },
                            "areaKeyword": { "type": "STRING" },
                            "huongCua": { "type": "STRING" },
                            "loaiNhaDat": { "type": "STRING" },
                            "loaiGiaoDich": { "type": "STRING" },
                            "loaiHinhBatDongSan": { "type": "STRING" },
                            "duAn": { "type": "STRING" }
                        }
                    }
                }
            };

            const apiKey = ""; // Canvas will provide this
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                const jsonText = result.candidates[0].content.parts[0].text;
                const filters = JSON.parse(jsonText);
                console.log("AI filters:", filters);

                let tempFilteredProperties = properties.filter(prop => {
                    let match = true;

                    if (filters.location && prop.location && !prop.location.toLowerCase().includes(filters.location.toLowerCase())) {
                        match = false;
                    }
                    if (filters.minPrice && (prop.price || prop.tongGiaDat)) {
                        const propPrice = parseFloat((prop.price || prop.tongGiaDat).replace(/[^0-9.]/g, ''));
                        const minPrice = parseFloat(filters.minPrice.replace(/[^0-9.]/g, ''));
                        if (isNaN(propPrice) || isNaN(minPrice) || propPrice < minPrice) {
                            match = false;
                        }
                    }
                    if (filters.maxPrice && (prop.price || prop.tongGiaDat)) {
                        const propPrice = parseFloat((prop.price || prop.tongGiaDat).replace(/[^0-9.]/g, ''));
                        const maxPrice = parseFloat(filters.maxPrice.replace(/[^0-9.]/g, ''));
                        if (isNaN(propPrice) || isNaN(maxPrice) || propPrice > maxPrice) {
                            match = false;
                        }
                    }
                    if (filters.minBedrooms && prop.bedrooms) {
                        const propBedrooms = parseInt(prop.bedrooms, 10);
                        const minBedrooms = parseInt(filters.minBedrooms, 10);
                        if (isNaN(propBedrooms) || isNaN(minBedrooms) || propBedrooms < minBedrooms) {
                            match = false;
                        }
                    }
                    if (filters.maxBedrooms && prop.bedrooms) {
                        const propBedrooms = parseInt(prop.bedrooms, 10);
                        const maxBedrooms = parseInt(filters.maxBedrooms, 10);
                        if (isNaN(propBedrooms) || isNaN(maxBedrooms) || propBedrooms > maxBedrooms) {
                            match = false;
                        }
                    }
                    if (filters.areaKeyword && prop.area) {
                        const areaText = prop.area.toLowerCase();
                        const areaValue = parseFloat(areaText.replace(/[^0-9.]/g, ''));
                        // Example thresholds, adjust as needed
                        if (filters.areaKeyword.toLowerCase().includes('nhỏ') && areaValue > 50) {
                            match = false;
                        } else if (filters.areaKeyword.toLowerCase().includes('lớn') && areaValue < 100) {
                            match = false;
                        }
                    }
                    if (filters.huongCua && prop.huongCua && !prop.huongCua.toLowerCase().includes(filters.huongCua.toLowerCase())) {
                        match = false;
                    }
                    if (filters.loaiNhaDat && prop.loaiNhaDat && !prop.loaiNhaDat.toLowerCase().includes(filters.loaiNhaDat.toLowerCase())) {
                        match = false;
                    }
                    if (filters.loaiGiaoDich && prop.loaiGiaoDich && !prop.loaiGiaoDich.toLowerCase().includes(filters.loaiGiaoDich.toLowerCase())) {
                        match = false;
                    }
                    if (filters.loaiHinhBatDongSan && prop.loaiHinhBatDongSan && !prop.loaiHinhBatDongSan.toLowerCase().includes(filters.loaiHinhBatDongSan.toLowerCase())) {
                        match = false;
                    }
                    if (filters.duAn && prop.duAn && !prop.duAn.toLowerCase().includes(filters.duAn.toLowerCase())) {
                        match = false;
                    }


                    // Fallback to keyword search on title and description if no specific filters
                    if (match && Object.keys(filters).length === 0 && searchQuery.trim()) {
                        const lowerCaseQuery = searchQuery.toLowerCase();
                        if (!(prop.title?.toLowerCase().includes(lowerCaseQuery) ||
                            prop.description?.toLowerCase().includes(lowerCaseQuery) ||
                            prop.location?.toLowerCase().includes(lowerCaseQuery) ||
                            prop.maBatDongSan?.toLowerCase().includes(lowerCaseQuery) ||
                            prop.nguonHang?.toLowerCase().includes(lowerCaseQuery) ||
                            prop.loaiHinhKhac?.toLowerCase().includes(lowerCaseQuery) ||
                            prop.duAn?.toLowerCase().includes(lowerCaseQuery) ||
                            prop.tags?.toLowerCase().includes(lowerCaseQuery)
                        )) {
                            match = false;
                        }
                    }

                    return match;
                });
                setFilteredProperties(tempFilteredProperties);
                showMessage(`Tìm kiếm AI hoàn tất. Tìm thấy ${tempFilteredProperties.length} kết quả.`);
            } else {
                showMessage("Lỗi: AI không thể hiểu yêu cầu tìm kiếm của bạn.", "error");
                setFilteredProperties([]); // Clear results on AI error
                console.error("AI search response structure unexpected:", result);
            }
        } catch (error) {
            console.error("Lỗi gọi API Gemini cho tìm kiếm:", error);
            showMessage("Lỗi: Không thể kết nối với AI để tìm kiếm.", "error");
            setFilteredProperties([]); // Clear results on error
        } finally {
            setLoading(false);
        }
    };

    // Function to share on Zalo
    const handleShareZalo = (property) => {
        const appUrl = window.location.href;
        const shareText = encodeURIComponent(`${property.title} - ${property.location}. Giá: ${property.price || property.tongGiaDat}. Mô tả: ${property.description.substring(0, 150)}...`);
        const zaloShareUrl = `https://chat.zalo.me/?url=${encodeURIComponent(appUrl)}&text=${shareText}`;
        window.open(zaloShareUrl, '_blank', 'width=600,height=600');
        showMessage("Đang mở Zalo để chia sẻ.");
    };

    // Function to share on Facebook
    const handleShareFacebook = (property) => {
        const appUrl = window.location.href;
        const shareQuote = encodeURIComponent(`${property.title} - ${property.location}. Giá: ${property.price || property.tongGiaDat}. Mô tả: ${property.description.substring(0, 150)}...`);
        const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(appUrl)}&quote=${shareQuote}`;
        window.open(facebookShareUrl, '_blank', 'width=600,height=600');
        showMessage("Đang mở Facebook để chia sẻ.");
    };

    // Handle Excel file upload
    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            setExcelFile(file);
            showMessage(`Đã chọn file: ${file.name}`);
        } else {
            setExcelFile(null);
            showMessage("Chưa chọn file nào.", "warning");
        }
    };

    // Import data from Excel
    const importFromExcel = async () => {
        if (!excelFile) {
            showMessage("Vui lòng chọn một file Excel để nhập.", "warning");
            return;
        }
        if (!db || !userId) {
            showMessage("Lỗi: Chưa đăng nhập hoặc Firebase chưa sẵn sàng.", "error");
            return;
        }
        setLoading(true);
        setMessage("Đang nhập dữ liệu từ Excel...");

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = window.XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = window.XLSX.utils.sheet_to_json(worksheet);

                let importedCount = 0;
                const propertiesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/properties`);

                for (const row of json) {
                    // Map Excel columns to form fields (case-insensitive and flexible)
                    const newProperty = {
                        maBatDongSan: generateMaBatDongSan(), // Auto-generate
                        chinhCau: row['chinhCau'] || row['Chính chủ'] || '',
                        khachQuanTam: row['khachQuanTam'] || row['Khách quan tâm'] || '',
                        nguoiTao: row['nguoiTao'] || row['Người tạo'] || '',
                        nguoiPhuTrach: row['nguoiPhuTrach'] || row['Người phụ trách'] || '',
                        daXemBoih: row['daXemBoih'] || row['Đã xem bởi'] || '',
                        title: row['title'] || row['Tiêu đề'] || '',
                        location: row['location'] || row['Vị trí'] || '',
                        latitude: row['latitude'] || row['Vĩ độ'] || '',
                        longitude: row['longitude'] || row['Kinh độ'] || '',
                        imageLink: row['imageLink'] || row['Link ảnh'] || '', // Map new field
                        videoLink: row['videoLink'] || row['Link video'] || '', // Map new field
                        area: row['area'] || row['Diện tích đất'] || '',
                        price: row['price'] || row['Tổng giá đất'] || '',
                        bedrooms: row['bedrooms'] || row['Số phòng ngủ'] || '',
                        bathrooms: row['bathrooms'] || row['Số phòng tắm'] || '',
                        contact: row['contact'] || row['Liên hệ'] || '',
                        description: row['description'] || row['Mô tả chi tiết'] || '',
                        loaiNhaDat: row['loaiNhaDat'] || row['Loại nhà đất'] || '',
                        loaiGiaoDich: row['loaiGiaoDich'] || row['Loại giao dịch'] || '',
                        loaiHinhBatDongSan: row['loaiHinhBatDongSan'] || row['Loại hình BĐS'] || '',
                        nguonHang: row['nguonHang'] || row['Nguồn hàng'] || '',
                        loaiHinhKhac: row['loaiHinhKhac'] || row['Loại hình khác'] || '',
                        loaiHinhKinhDoanh: row['loaiHinhKinhDoanh'] || row['Loại hình kinh doanh'] || '',
                        duAn: row['duAn'] || row['Dự án'] || '',
                        bangHang: row['bangHang'] || row['Bảng hàng'] || '',
                        giaiDoan: row['giaiDoan'] || row['Giai đoạn'] || '',
                        khu: row['khu'] || row['Khu'] || '',
                        soTo: row['soTo'] || row['Số tờ'] || '',
                        soThua: row['soThua'] || row['Số thửa'] || '',
                        toaDoVN2000: row['toaDoVN2000'] || row['Tọa độ VN 2000'] || '',
                        donGiaDat: row['donGiaDat'] || row['Đơn giá đất'] || '',
                        tongGiaDat: row['tongGiaDat'] || row['Tổng giá đất'] || '',
                        vatPhanTram: row['vatPhanTram'] || row['%VAT'] || '',
                        phiBaoTri: row['phiBaoTri'] || row['Phí bảo trì'] || '',
                        chiPhiKhac: row['chiPhiKhac'] || row['Chi phí khác'] || '',
                        tongGiaTriHopDong: row['tongGiaTriHopDong'] || row['Tổng giá trị hợp đồng'] || '',
                        giaChot: row['giaChot'] || row['Giá chốt'] || '',
                        hoaHongPhanTram: row['hoaHongPhanTram'] || row['%Hoa hồng'] || '',
                        tienHoaHong: row['tienHoaHong'] || row['Tiền hoa hồng'] || '',
                        dienTichXayDung: row['dienTichXayDung'] || row['Diện tích xây dựng'] || '',
                        matTien: row['matTien'] || row['Mặt tiền'] || '',
                        chieuSau: row['chieuSau'] || row['Chiều sâu'] || '',
                        matSau: row['matSau'] || row['Mặt sau'] || '',
                        duongRong: row['duongRong'] || row['Đường rộng'] || '',
                        huongCua: row['huongCua'] || row['Hướng cửa'] || '',
                        loaiCan: row['loaiCan'] || row['Loại căn'] || '',
                        soTang: row['soTang'] || row['Số tầng'] || '',
                        viTriTang: row['viTriTang'] || row['Vị trí tầng'] || '',
                        chiPhiNoiThat: row['chiPhiNoiThat'] || row['Chi phí nội thất'] || '',
                        danhGiaBDS: row['danhGiaBDS'] || row['Đánh giá BĐS'] || '',
                        danhGiaVeGia: row['danhGiaVeGia'] || row['Đánh giá về giá'] || '',
                        thongTinBoSung: row['thongTinBoSung'] || row['Thông tin bổ sung'] || '',
                        dacDiemNoiTroi: row['dacDiemNoiTroi'] || row['Đặc điểm nổi trội'] || '',
                        taiLieuPhapLy: row['taiLieuPhapLy'] || row['Tài liệu pháp lý'] || '',
                        ngayBanGiao: row['ngayBanGiao'] || row['Ngày bàn giao'] || '',
                        nhuocDiem: row['nhuocDiem'] || row['Nhược điểm'] || '',
                        tags: row['tags'] || row['Tags'] || '',
                        nguonTin: row['nguonTin'] || row['Nguồn tin'] || '',
                        ngayNhan: row['ngayNhan'] || row['Ngày nhận'] || '',
                    };
                    await addDoc(propertiesCollectionRef, newProperty);
                    importedCount++;
                }
                showMessage(`Đã nhập thành công ${importedCount} bất động sản từ Excel!`);
                setExcelFile(null); // Clear the selected file
            } catch (error) {
                console.error("Lỗi khi đọc hoặc nhập file Excel:", error);
                showMessage("Lỗi: Không thể đọc hoặc nhập file Excel. Vui lòng kiểm tra định dạng file.", "error");
            } finally {
                setLoading(false);
            }
        };
        reader.readAsArrayBuffer(excelFile);
    };

    // Export data to Excel
    const exportToExcel = () => {
        if (properties.length === 0) {
            showMessage("Không có dữ liệu để xuất.", "warning");
            return;
        }

        // Access XLSX from the global window object
        if (typeof window.XLSX === 'undefined') {
            showMessage("Lỗi: Thư viện XLSX chưa được tải. Vui lòng thử lại sau.", "error");
            return;
        }

        const data = properties.map(({ id, ...rest }) => rest); // Exclude Firestore ID
        const worksheet = window.XLSX.utils.json_to_sheet(data);
        const workbook = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(workbook, worksheet, "Bất động sản");
        window.XLSX.writeFile(workbook, "danh_sach_bat_dong_san.xlsx");
        showMessage("Đã xuất dữ liệu ra Excel thành công!");
    };

    // Dynamically load XLSX library from CDN
    useEffect(() => {
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
        script.onload = () => console.log('XLSX library loaded.');
        script.onerror = () => console.error('Failed to load XLSX library.');
        document.head.appendChild(script);
        return () => {
            document.head.removeChild(script);
        };
    }, []);


    if (!isAuthReady) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100">
                <p className="text-lg text-gray-700">Đang tải ứng dụng...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 p-4 font-sans flex flex-col items-center">
            <div className="w-full max-w-4xl bg-white rounded-xl shadow-lg p-6 mb-6">
                <h1 className="text-3xl font-bold text-center text-indigo-700 mb-6">
                    Quản lý Bất động sản của tôi
                </h1>

                {userId && (
                    <p className="text-sm text-center text-gray-500 mb-4">
                        ID người dùng: <span className="font-mono bg-gray-200 px-2 py-1 rounded">{userId}</span>
                    </p>
                )}

                {message && (
                    <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded relative mb-4" role="alert">
                        <span className="block sm:inline">{message}</span>
                    </div>
                )}

                {loading && (
                    <div className="flex items-center justify-center mb-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-700"></div>
                        <span className="ml-3 text-indigo-700">Đang xử lý...</span>
                    </div>
                )}

                {/* AI Search Section - Moved to top right */}
                <div className="flex justify-end mb-4">
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <input
                            type="text"
                            className="shadow appearance-none border rounded-lg py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent flex-grow"
                            placeholder="Tìm kiếm AI..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <button
                            onClick={handleAISearch}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline transition duration-200 ease-in-out transform hover:scale-105 disabled:opacity-50"
                            disabled={loading}
                        >
                            Tìm kiếm AI
                        </button>
                        <button
                            onClick={() => { setSearchQuery(''); setFilteredProperties(properties); showMessage("Đã hiển thị tất cả bất động sản."); }}
                            className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline transition duration-200 ease-in-out transform hover:scale-105 disabled:opacity-50"
                            disabled={loading}
                        >
                            Xóa tìm kiếm
                        </button>
                    </div>
                </div>

                {/* Property Form - Now wraps AI input and all fields */}
                <form onSubmit={handlePropertySubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    {/* AI Data Entry Section */}
                    <div className="col-span-full mb-4 p-4 border border-gray-200 rounded-lg">
                        <h2 className="text-2xl font-semibold text-indigo-600 mb-4">Nhập liệu tự động Bất động sản bằng AI & Excel</h2>
                        <div className="mb-4">
                            <label htmlFor="propertyInput" className="block text-gray-700 text-sm font-bold mb-2">
                                Dán mô tả bất động sản vào đây (dùng cho AI):
                            </label>
                            <textarea
                                id="propertyInput"
                                className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent h-32 resize-y"
                                placeholder="Ví dụ: BÁN NHÀ ĐẸP NGAY TRUNG TÂM CHỢ LỚN - SÓC TRĂNG..."
                                value={propertyInput}
                                onChange={(e) => setPropertyInput(e.target.value)}
                            ></textarea>
                        </div>
                        <div className="mb-4">
                            <label htmlFor="excelFileInput" className="block text-gray-700 text-sm font-bold mb-2">
                                Hoặc tải lên file Excel để nhập hàng loạt:
                            </label>
                            <input
                                type="file"
                                id="excelFileInput"
                                accept=".xlsx, .xls"
                                onChange={handleFileUpload}
                                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                            />
                        </div>
                        <div className="flex justify-end space-x-4">
                            <button
                                type="button"
                                onClick={analyzePropertyText}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline transition duration-200 ease-in-out transform hover:scale-105 disabled:opacity-50"
                                disabled={loading}
                            >
                                Phân tích bằng AI
                            </button>
                            <button
                                type="button"
                                onClick={importFromExcel}
                                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline transition duration-200 ease-in-out transform hover:scale-105 disabled:opacity-50"
                                disabled={loading || !excelFile}
                            >
                                Nhập dữ liệu từ Excel
                            </button>
                            <button
                                type="submit"
                                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline transition duration-200 ease-in-out transform hover:scale-105 disabled:opacity-50"
                                disabled={loading}
                            >
                                {form.id ? 'Cập nhật bất động sản' : 'Thêm bất động sản'}
                            </button>
                            <button
                                type="button"
                                onClick={clearPropertyForm}
                                className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline transition duration-200 ease-in-out transform hover:scale-105 disabled:opacity-50"
                                disabled={loading}
                            >
                                Xóa biểu mẫu BĐS
                            </button>
                        </div>
                    </div>

                    {/* Thông tin chính */}
                    <div className="col-span-full">
                        <h3 className="text-xl font-semibold text-gray-700 mb-2">Thông tin chính Bất động sản</h3>
                    </div>
                    <div>
                        <label htmlFor="chinhCau" className="block text-gray-700 text-sm font-bold mb-2">Chính chủ:</label>
                        <input type="text" id="chinhCau" name="chinhCau" value={form.chinhCau} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Chính chủ" />
                    </div>
                    <div>
                        <label htmlFor="khachQuanTam" className="block text-gray-700 text-sm font-bold mb-2">Khách quan tâm:</label>
                        <input type="text" id="khachQuanTam" name="khachQuanTam" value={form.khachQuanTam} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Khách quan tâm" />
                    </div>
                    <div>
                        <label htmlFor="nguoiTao" className="block text-gray-700 text-sm font-bold mb-2">Người tạo:</label>
                        <input type="text" id="nguoiTao" name="nguoiTao" value={form.nguoiTao} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Người tạo" />
                    </div>
                    <div>
                        <label htmlFor="nguoiPhuTrach" className="block text-gray-700 text-sm font-bold mb-2">Người phụ trách:</label>
                        <input type="text" id="nguoiPhuTrach" name="nguoiPhuTrach" value={form.nguoiPhuTrach} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Người phụ trách" />
                    </div>
                    <div>
                        <label htmlFor="daXemBoih" className="block text-gray-700 text-sm font-bold mb-2">Đã xem bởi:</label>
                        <input type="text" id="daXemBoih" name="daXemBoih" value={form.daXemBoih} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Đã xem bởi" />
                    </div>

                    <div className="col-span-full mt-4">
                        <h3 className="text-xl font-semibold text-gray-700 mb-2">Thông tin mô tả Bất động sản</h3>
                    </div>
                    <div className="col-span-full">
                        <label htmlFor="title" className="block text-gray-700 text-sm font-bold mb-2">Tiêu đề:</label>
                        <input type="text" id="title" name="title" value={form.title} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Tiêu đề bất động sản" required />
                    </div>
                    <div className="col-span-full">
                        <label htmlFor="description" className="block text-gray-700 text-sm font-bold mb-2">Mô tả chi tiết:</label>
                        <textarea id="description" name="description" value={form.description} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent h-32 resize-y" placeholder="Mô tả chi tiết về bất động sản"></textarea>
                    </div>

                    <div className="col-span-full mt-4">
                        <h3 className="text-xl font-semibold text-gray-700 mb-2">Thông tin cơ bản Bất động sản</h3>
                    </div>
                    <div>
                        <label htmlFor="loaiGiaoDich" className="block text-gray-700 text-sm font-bold mb-2">Loại giao dịch:</label>
                        <select id="loaiGiaoDich" name="loaiGiaoDich" value={form.loaiGiaoDich} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                            <option value="">Chọn loại giao dịch</option>
                            <option value="Mua bán">Mua bán</option>
                            <option value="Cho thuê">Cho thuê</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="loaiHinhBatDongSan" className="block text-gray-700 text-sm font-bold mb-2">Loại hình BĐS:</label>
                        <select id="loaiHinhBatDongSan" name="loaiHinhBatDongSan" value={form.loaiHinhBatDongSan} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                            <option value="">Chọn loại hình</option>
                            <option value="Nhà">Nhà</option>
                            <option value="Đất nền">Đất nền</option>
                            <option value="Căn hộ">Căn hộ</option>
                            <option value="Văn phòng">Văn phòng</option>
                            <option value="Thương mại">Thương mại</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="loaiNhaDat" className="block text-gray-700 text-sm font-bold mb-2">Loại nhà đất (chung):</label>
                        <input type="text" id="loaiNhaDat" name="loaiNhaDat" value={form.loaiNhaDat} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Ví dụ: Đất, Nhà, Căn hộ" />
                    </div>
                    <div>
                        <label htmlFor="nguonHang" className="block text-gray-700 text-sm font-bold mb-2">Nguồn hàng:</label>
                        <input type="text" id="nguonHang" name="nguonHang" value={form.nguonHang} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Ví dụ: Chủ gửi, Sàn" />
                    </div>
                    <div>
                        <label htmlFor="loaiHinhKhac" className="block text-gray-700 text-sm font-bold mb-2">Loại hình khác:</label>
                        <input type="text" id="loaiHinhKhac" name="loaiHinhKhac" value={form.loaiHinhKhac} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Ví dụ: Đất nền dự án" />
                    </div>
                    <div>
                        <label htmlFor="loaiHinhKinhDoanh" className="block text-gray-700 text-sm font-bold mb-2">Loại hình kinh doanh:</label>
                        <input type="text" id="loaiHinhKinhDoanh" name="loaiHinhKinhDoanh" value={form.loaiHinhKinhDoanh} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Loại hình kinh doanh" />
                    </div>

                    <div className="col-span-full mt-4">
                        <h3 className="text-xl font-semibold text-gray-700 mb-2">Thông tin dự án Bất động sản</h3>
                    </div>
                    <div>
                        <label htmlFor="duAn" className="block text-gray-700 text-sm font-bold mb-2">Dự án:</label>
                        <input type="text" id="duAn" name="duAn" value={form.duAn} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Ví dụ: Khu đô thị 5A Mekong Centre Sóc Trăng" />
                    </div>
                    <div>
                        <label htmlFor="bangHang" className="block text-gray-700 text-sm font-bold mb-2">Bảng hàng:</label>
                        <input type="text" id="bangHang" name="bangHang" value={form.bangHang} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Bảng hàng" />
                    </div>
                    <div>
                        <label htmlFor="giaiDoan" className="block text-gray-700 text-sm font-bold mb-2">Giai đoạn:</label>
                        <input type="text" id="giaiDoan" name="giaiDoan" value={form.giaiDoan} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Giai đoạn" />
                    </div>
                    <div>
                        <label htmlFor="khu" className="block text-gray-700 text-sm font-bold mb-2">Khu:</label>
                        <input type="text" id="khu" name="khu" value={form.khu} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Khu" />
                    </div>
                    <div>
                        <label htmlFor="soTo" className="block text-gray-700 text-sm font-bold mb-2">Số tờ:</label>
                        <input type="text" id="soTo" name="soTo" value={form.soTo} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Số tờ" />
                    </div>
                    <div>
                        <label htmlFor="soThua" className="block text-gray-700 text-sm font-bold mb-2">Số thửa:</label>
                        <input type="text" id="soThua" name="soThua" value={form.soThua} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Số thửa" />
                    </div>
                    <div>
                        <label htmlFor="toaDoVN2000" className="block text-gray-700 text-sm font-bold mb-2">Tọa độ VN 2000:</label>
                        <input type="text" id="toaDoVN2000" name="toaDoVN2000" value={form.toaDoVN2000} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Tọa độ VN 2000" />
                    </div>

                    <div className="col-span-full mt-4">
                        <h3 className="text-xl font-semibold text-gray-700 mb-2">Thông tin giá cả & hợp đồng Bất động sản</h3>
                    </div>
                    <div>
                        <label htmlFor="donGiaDat" className="block text-gray-700 text-sm font-bold mb-2">Đơn giá đất:</label>
                        <input type="text" id="donGiaDat" name="donGiaDat" value={form.donGiaDat} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Đơn giá đất" />
                    </div>
                    <div>
                        <label htmlFor="tongGiaDat" className="block text-gray-700 text-sm font-bold mb-2">Tổng giá đất:</label>
                        <input type="text" id="tongGiaDat" name="tongGiaDat" value={form.tongGiaDat} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Tổng giá đất" />
                    </div>
                    <div>
                        <label htmlFor="vatPhanTram" className="block text-gray-700 text-sm font-bold mb-2">%VAT:</label>
                        <input type="text" id="vatPhanTram" name="vatPhanTram" value={form.vatPhanTram} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="%VAT" />
                    </div>
                    <div>
                        <label htmlFor="phiBaoTri" className="block text-gray-700 text-sm font-bold mb-2">Phí bảo trì:</label>
                        <input type="text" id="phiBaoTri" name="phiBaoTri" value={form.phiBaoTri} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Phí bảo trì" />
                    </div>
                    <div>
                        <label htmlFor="chiPhiKhac" className="block text-gray-700 text-sm font-bold mb-2">Chi phí khác:</label>
                        <input type="text" id="chiPhiKhac" name="chiPhiKhac" value={form.chiPhiKhac} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Chi phí khác" />
                    </div>
                    <div>
                        <label htmlFor="tongGiaTriHopDong" className="block text-gray-700 text-sm font-bold mb-2">Tổng giá trị hợp đồng:</label>
                        <input type="text" id="tongGiaTriHopDong" name="tongGiaTriHopDong" value={form.tongGiaTriHopDong} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Tổng giá trị hợp đồng" />
                    </div>
                    <div>
                        <label htmlFor="giaChot" className="block text-gray-700 text-sm font-bold mb-2">Giá chốt:</label>
                        <input type="text" id="giaChot" name="giaChot" value={form.giaChot} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Giá chốt" />
                    </div>
                    <div>
                        <label htmlFor="hoaHongPhanTram" className="block text-gray-700 text-sm font-bold mb-2">%Hoa hồng:</label>
                        <input type="text" id="hoaHongPhanTram" name="hoaHongPhanTram" value={form.hoaHongPhanTram} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="%Hoa hồng" />
                    </div>
                    <div>
                        <label htmlFor="tienHoaHong" className="block text-gray-700 text-sm font-bold mb-2">Tiền hoa hồng:</label>
                        <input type="text" id="tienHoaHong" name="tienHoaHong" value={form.tienHoaHong} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Tiền hoa hồng" />
                    </div>

                    <div className="col-span-full mt-4">
                        <h3 className="text-xl font-semibold text-gray-700 mb-2">Thông tin chi tiết Bất động sản</h3>
                    </div>
                    <div>
                        <label htmlFor="area" className="block text-gray-700 text-sm font-bold mb-2">Diện tích đất:</label>
                        <input type="text" id="area" name="area" value={form.area} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Ví dụ: 106 m2" />
                    </div>
                    <div>
                        <label htmlFor="dienTichXayDung" className="block text-gray-700 text-sm font-bold mb-2">Diện tích xây dựng:</label>
                        <input type="text" id="dienTichXayDung" name="dienTichXayDung" value={form.dienTichXayDung} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Diện tích xây dựng" />
                    </div>
                    <div>
                        <label htmlFor="matTien" className="block text-gray-700 text-sm font-bold mb-2">Mặt tiền:</label>
                        <input type="text" id="matTien" name="matTien" value={form.matTien} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Ví dụ: 5.3 m" />
                    </div>
                    <div>
                        <label htmlFor="chieuSau" className="block text-gray-700 text-sm font-bold mb-2">Chiều sâu:</label>
                        <input type="text" id="chieuSau" name="chieuSau" value={form.chieuSau} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Ví dụ: 20 m" />
                    </div>
                    <div>
                        <label htmlFor="matSau" className="block text-gray-700 text-sm font-bold mb-2">Mặt sau:</label>
                        <input type="text" id="matSau" name="matSau" value={form.matSau} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Mặt sau" />
                    </div>
                    <div>
                        <label htmlFor="duongRong" className="block text-gray-700 text-sm font-bold mb-2">Đường rộng:</label>
                        <input type="text" id="duongRong" name="duongRong" value={form.duongRong} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Đường rộng" />
                    </div>
                    <div>
                        <label htmlFor="huongCua" className="block text-gray-700 text-sm font-bold mb-2">Hướng cửa:</label>
                        <input type="text" id="huongCua" name="huongCua" value={form.huongCua} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Ví dụ: Tây Bắc" />
                    </div>
                    <div>
                        <label htmlFor="loaiCan" className="block text-gray-700 text-sm font-bold mb-2">Loại căn:</label>
                        <input type="text" id="loaiCan" name="loaiCan" value={form.loaiCan} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Loại căn" />
                    </div>
                    <div>
                        <label htmlFor="soTang" className="block text-gray-700 text-sm font-bold mb-2">Số tầng:</label>
                        <input type="text" id="soTang" name="soTang" value={form.soTang} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Số tầng" />
                    </div>
                    <div>
                        <label htmlFor="viTriTang" className="block text-gray-700 text-sm font-bold mb-2">Vị trí tầng:</label>
                        <input type="text" id="viTriTang" name="viTriTang" value={form.viTriTang} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Vị trí tầng" />
                    </div>
                    <div>
                        <label htmlFor="bedrooms" className="block text-gray-700 text-sm font-bold mb-2">Số phòng ngủ:</label>
                        <input type="text" id="bedrooms" name="bedrooms" value={form.bedrooms} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Ví dụ: 4" />
                    </div>
                    <div>
                        <label htmlFor="bathrooms" className="block text-gray-700 text-sm font-bold mb-2">Số toilet:</label>
                        <input type="text" id="bathrooms" name="bathrooms" value={form.bathrooms} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Ví dụ: 2" />
                    </div>
                    <div>
                        <label htmlFor="chiPhiNoiThat" className="block text-gray-700 text-sm font-bold mb-2">Chi phí nội thất:</label>
                        <input type="text" id="chiPhiNoiThat" name="chiPhiNoiThat" value={form.chiPhiNoiThat} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Chi phí nội thất" />
                    </div>
                    <div>
                        <label htmlFor="contact" className="block text-gray-700 text-sm font-bold mb-2">Liên hệ:</label>
                        <input type="text" id="contact" name="contact" value={form.contact} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Ví dụ: Mr. Lắm: 0946261719" />
                    </div>
                    <div>
                        <label htmlFor="imageLink" className="block text-gray-700 text-sm font-bold mb-2">Link ảnh:</label>
                        <input type="text" id="imageLink" name="imageLink" value={form.imageLink} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="URL ảnh bất động sản" />
                    </div>
                    <div>
                        <label htmlFor="videoLink" className="block text-gray-700 text-sm font-bold mb-2">Link video:</label>
                        <input type="text" id="videoLink" name="videoLink" value={form.videoLink} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="URL video bất động sản" />
                    </div>

                    <div className="col-span-full mt-4">
                        <h3 className="text-xl font-semibold text-gray-700 mb-2">Đánh giá & Bổ sung Bất động sản</h3>
                    </div>
                    <div>
                        <label htmlFor="danhGiaBDS" className="block text-gray-700 text-sm font-bold mb-2">Đánh giá BĐS:</label>
                        <input type="text" id="danhGiaBDS" name="danhGiaBDS" value={form.danhGiaBDS} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Ví dụ: Đẹp, Trung bình" />
                    </div>
                    <div>
                        <label htmlFor="danhGiaVeGia" className="block text-gray-700 text-sm font-bold mb-2">Đánh giá về giá:</label>
                        <input type="text" id="danhGiaVeGia" name="danhGiaVeGia" value={form.danhGiaVeGia} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Ví dụ: Giá hợp lý, Cao" />
                    </div>
                    <div className="col-span-full">
                        <label htmlFor="thongTinBoSung" className="block text-gray-700 text-sm font-bold mb-2">Thông tin bổ sung:</label>
                        <textarea id="thongTinBoSung" name="thongTinBoSung" value={form.thongTinBoSung} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Thông tin bổ sung"></textarea>
                    </div>
                    <div className="col-span-full">
                        <label htmlFor="dacDiemNoiTroi" className="block text-gray-700 text-sm font-bold mb-2">Đặc điểm nổi trội:</label>
                        <textarea id="dacDiemNoiTroi" name="dacDiemNoiTroi" value={form.dacDiemNoiTroi} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Ví dụ: Gần nhiều tiện ích, Giao thông thuận tiện"></textarea>
                    </div>
                    <div>
                        <label htmlFor="taiLieuPhapLy" className="block text-gray-700 text-sm font-bold mb-2">Tài liệu pháp lý:</label>
                        <input type="text" id="taiLieuPhapLy" name="taiLieuPhapLy" value={form.taiLieuPhapLy} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Ví dụ: Sổ đỏ, Sổ hồng" />
                    </div>
                    <div>
                        <label htmlFor="ngayBanGiao" className="block text-gray-700 text-sm font-bold mb-2">Ngày bàn giao:</label>
                        <input type="text" id="ngayBanGiao" name="ngayBanGiao" value={form.ngayBanGiao} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Ngày bàn giao" />
                    </div>
                    <div className="col-span-full">
                        <label htmlFor="nhuocDiem" className="block text-gray-700 text-sm font-bold mb-2">Nhược điểm:</label>
                        <textarea id="nhuocDiem" name="nhuocDiem" value={form.nhuocDiem} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Nhược điểm"></textarea>
                    </div>
                    <div>
                        <label htmlFor="tags" className="block text-gray-700 text-sm font-bold mb-2">Tags:</label>
                        <input type="text" id="tags" name="tags" value={form.tags} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Ví dụ: nhà phố, mặt tiền, kinh doanh" />
                    </div>
                    <div>
                        <label htmlFor="nguonTin" className="block text-gray-700 text-sm font-bold mb-2">Nguồn tin:</label>
                        <input type="text" id="nguonTin" name="nguonTin" value={form.nguonTin} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Nguồn tin" />
                    </div>
                    <div>
                        <label htmlFor="ngayNhan" className="block text-gray-700 text-sm font-bold mb-2">Ngày nhận:</label>
                        <input type="text" id="ngayNhan" name="ngayNhan" value={form.ngayNhan} onChange={handlePropertyChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Ngày nhận" />
                    </div>

                </form>

                {/* Property List and Export */}
                <div className="mb-6">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-2xl font-semibold text-indigo-600">Danh sách Bất động sản ({filteredProperties.length} kết quả)</h2>
                        <button
                            onClick={exportToExcel}
                            className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline transition duration-200 ease-in-out transform hover:scale-105 disabled:opacity-50"
                            disabled={loading}
                        >
                            Xuất Excel
                        </button>
                    </div>
                    {filteredProperties.length === 0 ? (
                        <p className="text-center text-gray-500">Không có bất động sản nào được tìm thấy.</p>
                    ) : (
                        <div className="overflow-x-auto rounded-lg shadow-md">
                            <table className="min-w-full bg-white">
                                <thead className="bg-gray-200">
                                    <tr>
                                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">Mã BĐS</th>
                                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">Tiêu đề</th>
                                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">Loại GD</th>
                                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">Loại hình</th>
                                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">Vị trí</th>
                                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">Giá</th>
                                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">Phòng ngủ</th>
                                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">Liên hệ</th>
                                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">Ảnh/Video</th> {/* New column header */}
                                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">Hành động</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredProperties.map((property, index) => (
                                        <tr key={property.id || `prop-${index}`} className="border-b border-gray-200 hover:bg-gray-50">
                                            <td className="py-3 px-4 text-sm text-gray-800 font-medium">{property.maBatDongSan}</td>
                                            <td className="py-3 px-4 text-sm text-gray-800 font-medium">{property.title}</td>
                                            <td className="py-3 px-4 text-sm text-gray-700">{property.loaiGiaoDich}</td>
                                            <td className="py-3 px-4 text-sm text-gray-700">{property.loaiHinhBatDongSan}</td>
                                            <td className="py-3 px-4 text-sm text-gray-700">{property.location}</td>
                                            <td className="py-3 px-4 text-sm text-gray-700">{property.price || property.tongGiaDat}</td>
                                            <td className="py-3 px-4 text-sm text-gray-700">{property.bedrooms}</td>
                                            <td className="py-3 px-4 text-sm text-gray-700">{property.contact}</td>
                                            <td className="py-3 px-4 text-sm text-gray-700">
                                                {property.imageLink && <a href={property.imageLink} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline mr-2">Ảnh</a>}
                                                {property.videoLink && <a href={property.videoLink} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Video</a>}
                                            </td>
                                            <td className="py-3 px-4 text-sm">
                                                <div className="flex flex-wrap gap-2"> {/* Use flex-wrap for better mobile display */}
                                                    <button
                                                        onClick={() => handleEditProperty(property)}
                                                        className="bg-yellow-500 hover:bg-yellow-600 text-white py-1 px-3 rounded-lg text-xs transition duration-200 ease-in-out transform hover:scale-105"
                                                        disabled={loading}
                                                    >
                                                        Sửa
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteProperty(property.id)}
                                                        className="bg-red-500 hover:bg-red-600 text-white py-1 px-3 rounded-lg text-xs transition duration-200 ease-in-out transform hover:scale-105"
                                                        disabled={loading}
                                                    >
                                                        Xóa
                                                    </button>
                                                    <button
                                                        onClick={() => handleShareZalo(property)}
                                                        className="bg-blue-500 hover:bg-blue-600 text-white py-1 px-3 rounded-lg text-xs transition duration-200 ease-in-out transform hover:scale-105"
                                                        disabled={loading}
                                                    >
                                                        Zalo
                                                    </button>
                                                    <button
                                                        onClick={() => handleShareFacebook(property)}
                                                        className="bg-blue-700 hover:bg-blue-800 text-white py-1 px-3 rounded-lg text-xs transition duration-200 ease-in-out transform hover:scale-105"
                                                        disabled={loading}
                                                    >
                                                        Facebook
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Customer Management Section */}
                <div className="w-full max-w-4xl bg-white rounded-xl shadow-lg p-6 mb-6 mt-8">
                    <h2 className="text-3xl font-bold text-center text-purple-700 mb-6">
                        Quản lý Khách hàng
                    </h2>

                    {/* AI Customer Needs Analysis */}
                    <div className="mb-8 p-4 border border-gray-200 rounded-lg">
                        <h3 className="text-2xl font-semibold text-purple-600 mb-4">Phân tích nhu cầu khách hàng bằng AI</h3>
                        <div className="mb-4">
                            <label htmlFor="customerNeedsInput" className="block text-gray-700 text-sm font-bold mb-2">
                                Dán mô tả nhu cầu khách hàng vào đây:
                            </label>
                            <textarea
                                id="customerNeedsInput"
                                className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent h-24 resize-y"
                                placeholder="Ví dụ: Khách hàng muốn mua nhà 3 phòng ngủ ở khu vực trung tâm Sóc Trăng, giá dưới 2 tỷ..."
                                value={customerNeedsInput}
                                onChange={(e) => setCustomerNeedsInput(e.target.value)}
                            ></textarea>
                        </div>
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={analyzeCustomerNeeds}
                                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline transition duration-200 ease-in-out transform hover:scale-105 disabled:opacity-50"
                                disabled={loading}
                            >
                                Phân tích nhu cầu AI
                            </button>
                        </div>
                    </div>

                    {/* Customer Form */}
                    <form onSubmit={handleCustomerSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                        <div className="col-span-full">
                            <h3 className="text-xl font-semibold text-gray-700 mb-2">Thông tin Khách hàng</h3>
                        </div>
                        <div>
                            <label htmlFor="customerName" className="block text-gray-700 text-sm font-bold mb-2">Tên khách hàng:</label>
                            <input type="text" id="customerName" name="name" value={customerForm.name} onChange={handleCustomerChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" placeholder="Tên khách hàng" required />
                        </div>
                        <div>
                            <label htmlFor="customerPhone" className="block text-gray-700 text-sm font-bold mb-2">Điện thoại:</label>
                            <input type="text" id="customerPhone" name="phone" value={customerForm.phone} onChange={handleCustomerChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" placeholder="Số điện thoại" />
                        </div>
                        <div>
                            <label htmlFor="customerEmail" className="block text-gray-700 text-sm font-bold mb-2">Email:</label>
                            <input type="email" id="customerEmail" name="email" value={customerForm.email} onChange={handleCustomerChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" placeholder="Email" />
                        </div>
                        <div>
                            <label htmlFor="customerZalo" className="block text-gray-700 text-sm font-bold mb-2">Link Zalo:</label>
                            <input type="text" id="customerZalo" name="zaloLink" value={customerForm.zaloLink} onChange={handleCustomerChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" placeholder="Link Zalo" />
                        </div>
                        <div>
                            <label htmlFor="customerFacebook" className="block text-gray-700 text-sm font-bold mb-2">Link Facebook:</label>
                            <input type="text" id="customerFacebook" name="facebookLink" value={customerForm.facebookLink} onChange={handleCustomerChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" placeholder="Link Facebook" />
                        </div>
                        <div className="col-span-full">
                            <label htmlFor="customerNeeds" className="block text-gray-700 text-sm font-bold mb-2">Nhu cầu khách hàng:</label>
                            <textarea id="customerNeeds" name="needs" value={customerForm.needs} onChange={handleCustomerChange} className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent h-24 resize-y" placeholder="Mô tả nhu cầu (đã phân tích bởi AI nếu có)"></textarea>
                        </div>
                        <div className="col-span-full">
                            <label htmlFor="customerNotes" className="block text-gray-700 text-sm font-bold mb-2">Ghi chú:</label>
                            <textarea id="customerNotes" name="notes" value={customerForm.notes} onChange={handleCustomerChange} className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent h-24 resize-y" placeholder="Ghi chú thêm về khách hàng"></textarea>
                        </div>
                        <div className="col-span-full flex justify-end space-x-4">
                            <button
                                type="button"
                                onClick={clearCustomerForm}
                                className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline transition duration-200 ease-in-out transform hover:scale-105 disabled:opacity-50"
                                disabled={loading}
                            >
                                Xóa biểu mẫu Khách hàng
                            </button>
                            <button
                                type="submit"
                                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline transition duration-200 ease-in-out transform hover:scale-105 disabled:opacity-50"
                                disabled={loading}
                            >
                                {customerForm.id ? 'Cập nhật Khách hàng' : 'Thêm Khách hàng'}
                            </button>
                        </div>
                    </form>

                    {/* Customer List */}
                    <div className="mb-6">
                        <h2 className="text-2xl font-semibold text-purple-600 mb-4">Danh sách Khách hàng ({customers.length} khách hàng)</h2>
                        {customers.length === 0 ? (
                            <p className="text-center text-gray-500">Chưa có khách hàng nào.</p>
                        ) : (
                            <div className="overflow-x-auto rounded-lg shadow-md">
                                <table className="min-w-full bg-white">
                                    <thead className="bg-gray-200">
                                        <tr>
                                            <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">Tên</th>
                                            <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">Điện thoại</th>
                                            <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">Email</th>
                                            <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">Nhu cầu</th>
                                            <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">Mạng xã hội</th>
                                            <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">Hành động</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {customers.map((customer, index) => (
                                            <tr key={customer.id || `cust-${index}`} className="border-b border-gray-200 hover:bg-gray-50">
                                                <td className="py-3 px-4 text-sm text-gray-800 font-medium">{customer.name}</td>
                                                <td className="py-3 px-4 text-sm text-gray-700">{customer.phone}</td>
                                                <td className="py-3 px-4 text-sm text-gray-700">{customer.email}</td>
                                                <td className="py-3 px-4 text-sm text-gray-700">{customer.needs}</td>
                                                <td className="py-3 px-4 text-sm text-gray-700">
                                                    {customer.zaloLink && <a href={customer.zaloLink} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline mr-2">Zalo</a>}
                                                    {customer.facebookLink && <a href={customer.facebookLink} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">Facebook</a>}
                                                </td>
                                                <td className="py-3 px-4 text-sm">
                                                    <div className="flex flex-wrap gap-2">
                                                        <button
                                                            onClick={() => handleEditCustomer(customer)}
                                                            className="bg-yellow-500 hover:bg-yellow-600 text-white py-1 px-3 rounded-lg text-xs transition duration-200 ease-in-out transform hover:scale-105"
                                                            disabled={loading}
                                                        >
                                                            Sửa
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteCustomer(customer.id)}
                                                            className="bg-red-500 hover:bg-red-600 text-white py-1 px-3 rounded-lg text-xs transition duration-200 ease-in-out transform hover:scale-105"
                                                            disabled={loading}
                                                        >
                                                            Xóa
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Appointment Management Section */}
                <div className="w-full max-w-4xl bg-white rounded-xl shadow-lg p-6 mb-6 mt-8">
                    <h2 className="text-3xl font-bold text-center text-green-700 mb-6">
                        Quản lý Lịch hẹn
                    </h2>

                    {/* Appointment Form */}
                    <form onSubmit={handleAppointmentSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                        <div className="col-span-full">
                            <h3 className="text-xl font-semibold text-gray-700 mb-2">Thông tin Lịch hẹn</h3>
                        </div>
                        <div>
                            <label htmlFor="appointmentCustomer" className="block text-gray-700 text-sm font-bold mb-2">Khách hàng:</label>
                            <select id="appointmentCustomer" name="customerId" value={appointmentForm.customerId} onChange={handleAppointmentChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" required>
                                <option value="">Chọn khách hàng</option>
                                {customers.map((customer, index) => (
                                    <option key={customer.id || `cust-opt-${index}`} value={customer.id}>{customer.name} ({customer.phone})</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="appointmentProperty" className="block text-gray-700 text-sm font-bold mb-2">Bất động sản (tùy chọn):</label>
                            <select id="appointmentProperty" name="propertyId" value={appointmentForm.propertyId} onChange={handleAppointmentChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent">
                                <option value="">Chọn bất động sản</option>
                                {properties.map((property, index) => (
                                    <option key={property.id || `prop-opt-${index}`} value={property.id}>{property.title} ({property.maBatDongSan})</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="appointmentDate" className="block text-gray-700 text-sm font-bold mb-2">Ngày hẹn:</label>
                            <input type="date" id="appointmentDate" name="date" value={appointmentForm.date} onChange={handleAppointmentChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" required />
                        </div>
                        <div>
                            <label htmlFor="appointmentTime" className="block text-gray-700 text-sm font-bold mb-2">Giờ hẹn:</label>
                            <input type="time" id="appointmentTime" name="time" value={appointmentForm.time} onChange={handleAppointmentChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" required />
                        </div>
                        <div className="col-span-full">
                            <label htmlFor="appointmentPurpose" className="block text-gray-700 text-sm font-bold mb-2">Mục đích:</label>
                            <input type="text" id="appointmentPurpose" name="purpose" value={appointmentForm.purpose} onChange={handleAppointmentChange} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" placeholder="Mục đích cuộc hẹn" />
                        </div>
                        <div className="col-span-full">
                            <label htmlFor="appointmentNotes" className="block text-gray-700 text-sm font-bold mb-2">Ghi chú:</label>
                            <textarea id="appointmentNotes" name="notes" value={appointmentForm.notes} onChange={handleAppointmentChange} className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent h-24 resize-y" placeholder="Ghi chú thêm về lịch hẹn"></textarea>
                        </div>
                        <div className="col-span-full flex justify-end space-x-4">
                            <button
                                type="button"
                                onClick={clearAppointmentForm}
                                className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline transition duration-200 ease-in-out transform hover:scale-105 disabled:opacity-50"
                                disabled={loading}
                            >
                                Xóa biểu mẫu Lịch hẹn
                            </button>
                            <button
                                type="submit"
                                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline transition duration-200 ease-in-out transform hover:scale-105 disabled:opacity-50"
                                disabled={loading}
                            >
                                {appointmentForm.id ? 'Cập nhật Lịch hẹn' : 'Thêm Lịch hẹn'}
                            </button>
                        </div>
                    </form>

                    {/* Appointment List */}
                    <div className="mb-6">
                        <h2 className="text-2xl font-semibold text-green-600 mb-4">Danh sách Lịch hẹn ({appointments.length} lịch hẹn)</h2>
                        {appointments.length === 0 ? (
                            <p className="text-center text-gray-500">Chưa có lịch hẹn nào.</p>
                        ) : (
                            <div className="overflow-x-auto rounded-lg shadow-md">
                                <table className="min-w-full bg-white">
                                    <thead className="bg-gray-200">
                                        <tr>
                                            <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">Khách hàng</th>
                                            <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">Bất động sản</th>
                                            <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">Ngày</th>
                                            <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">Giờ</th>
                                            <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">Mục đích</th>
                                            <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">Hành động</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {appointments.map((appointment, index) => {
                                            const customer = customers.find(c => c.id === appointment.customerId);
                                            const property = properties.find(p => p.id === appointment.propertyId);
                                            return (
                                                <tr key={appointment.id || `appt-${index}`} className="border-b border-gray-200 hover:bg-gray-50">
                                                    <td className="py-3 px-4 text-sm text-gray-800 font-medium">{customer ? customer.name : 'N/A'}</td>
                                                    <td className="py-3 px-4 text-sm text-gray-700">{property ? property.title : 'N/A'}</td>
                                                    <td className="py-3 px-4 text-sm text-gray-700">{appointment.date}</td>
                                                    <td className="py-3 px-4 text-sm text-gray-700">{appointment.time}</td>
                                                    <td className="py-3 px-4 text-sm text-gray-700">{appointment.purpose}</td>
                                                    <td className="py-3 px-4 text-sm">
                                                        <div className="flex flex-wrap gap-2">
                                                            <button
                                                                onClick={() => handleEditAppointment(appointment)}
                                                                className="bg-yellow-500 hover:bg-yellow-600 text-white py-1 px-3 rounded-lg text-xs transition duration-200 ease-in-out transform hover:scale-105"
                                                                disabled={loading}
                                                            >
                                                                Sửa
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteAppointment(appointment.id)}
                                                                className="bg-red-500 hover:bg-red-600 text-white py-1 px-3 rounded-lg text-xs transition duration-200 ease-in-out transform hover:scale-105"
                                                                disabled={loading}
                                                            >
                                                                Xóa
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default App;
